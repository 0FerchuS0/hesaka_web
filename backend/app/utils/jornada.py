from dataclasses import dataclass
from datetime import date, datetime, time, timezone, tzinfo
from types import SimpleNamespace
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import selectinload

from app.models.models import (
    Banco,
    ConfiguracionCaja,
    CorteJornadaFinanciera,
    DestinatarioRendicion,
    JornadaFinanciera,
    MovimientoBanco,
    MovimientoCaja,
    Pago,
    RendicionJornadaFinanciera,
    Usuario,
    Venta,
)
from app.utils.timezone import (
    ahora_negocio,
    fecha_actual_negocio,
    normalizar_fecha_negocio,
    zona_horaria_negocio as _zona_horaria_negocio,
)

def resolver_destinatario_rendicion_activo(session, destinatario_id: int) -> DestinatarioRendicion:
    dest = session.query(DestinatarioRendicion).filter(DestinatarioRendicion.id == destinatario_id).first()
    if not dest:
        raise HTTPException(status_code=404, detail="Destinatario de rendicion no encontrado.")
    if not dest.activo:
        raise HTTPException(
            status_code=400,
            detail="El destinatario esta inactivo. Elija otro o pida a un administrador que lo reactive.",
        )
    return dest


@dataclass
class MovimientoJornadaNormalizado:
    fecha: datetime
    instante_corte: datetime
    origen: str
    categoria: str
    medio: str
    concepto: str
    monto: float
    tipo: str
    referencia: str
    banco_id: Optional[int] = None
    banco_nombre: Optional[str] = None
    ruta_origen: Optional[str] = None
    incluye_en_totales: bool = True
    movimiento_id: Optional[int] = None
    venta_id: Optional[int] = None
    venta_codigo: Optional[str] = None
    cliente_nombre: Optional[str] = None
    pago_id: Optional[int] = None


def hoy_jornada(session=None) -> date:
    return fecha_actual_negocio(session)


def _normalizar_datetime_local(value: datetime, tz: tzinfo) -> datetime:
    # Timestamps con tz se convierten a zona de negocio para comparaciones consistentes.
    if value.tzinfo is None:
        return value
    return value.astimezone(tz).replace(tzinfo=None)


def _instante_movimiento_sql_least(m, tz: tzinfo) -> datetime:
    """Replica least(coalesce(fecha,created_at), coalesce(created_at,fecha)) usado en filtros SQL de cortes."""
    f = getattr(m, "fecha", None)
    c = getattr(m, "created_at", None)
    # created_at proviene de utcnow() en TimestampMixin; si está naive, se interpreta como UTC.
    if c is not None and getattr(c, "tzinfo", None) is None:
        c = c.replace(tzinfo=timezone.utc).astimezone(tz).replace(tzinfo=None)
    f2 = f if f is not None else c
    c2 = c if c is not None else f
    if f2 is None and c2 is None:
        return datetime.min
    if f2 is None:
        return _normalizar_datetime_local(c2, tz)
    if c2 is None:
        return _normalizar_datetime_local(f2, tz)
    a = _normalizar_datetime_local(f2, tz)
    b = _normalizar_datetime_local(c2, tz)
    return a if a <= b else b


def _jornada_sin_movimientos(session, jornada_id: int) -> bool:
    checks = [
        session.query(MovimientoCaja.id).filter(MovimientoCaja.jornada_id == jornada_id).first(),
        session.query(MovimientoBanco.id).filter(MovimientoBanco.jornada_id == jornada_id).first(),
        session.query(CorteJornadaFinanciera.id).filter(CorteJornadaFinanciera.jornada_id == jornada_id).first(),
        session.query(RendicionJornadaFinanciera.id).filter(RendicionJornadaFinanciera.jornada_id == jornada_id).first(),
    ]
    return all(item is None for item in checks)


def corregir_jornada_adelantada_por_utc(session, today: date) -> None:
    futuras_abiertas = (
        session.query(JornadaFinanciera)
        .filter(JornadaFinanciera.estado == "ABIERTA", JornadaFinanciera.fecha > today)
        .all()
    )
    if not futuras_abiertas:
        return

    corrigio = False
    for jornada in futuras_abiertas:
        hora_apertura = jornada.fecha_hora_apertura
        parece_desfase_utc = (
            hora_apertura is not None
            and hora_apertura.date() == jornada.fecha
            and hora_apertura.hour < 4
        )
        if parece_desfase_utc and _jornada_sin_movimientos(session, jornada.id):
            session.delete(jornada)
            corrigio = True

    if corrigio:
        jornada_hoy = (
            session.query(JornadaFinanciera)
            .filter(JornadaFinanciera.fecha == today, JornadaFinanciera.estado == "VENCIDA")
            .first()
        )
        if jornada_hoy:
            jornada_hoy.estado = "ABIERTA"
        session.flush()


def vencer_jornadas_antiguas(session) -> None:
    today = hoy_jornada(session)
    corregir_jornada_adelantada_por_utc(session, today)
    (
        session.query(JornadaFinanciera)
        .filter(JornadaFinanciera.estado == "ABIERTA", JornadaFinanciera.fecha < today)
        .update({"estado": "VENCIDA"}, synchronize_session=False)
    )
    session.flush()


def obtener_jornada_actual(session, *, incluir_vencida: bool = True):
    vencer_jornadas_antiguas(session)
    query = session.query(JornadaFinanciera).filter(JornadaFinanciera.fecha == hoy_jornada(session))
    if not incluir_vencida:
        query = query.filter(JornadaFinanciera.estado == "ABIERTA")
    return query.first()


def obtener_ultima_jornada_anterior(session) -> JornadaFinanciera | None:
    vencer_jornadas_antiguas(session)
    return (
        session.query(JornadaFinanciera)
        .filter(JornadaFinanciera.fecha < hoy_jornada(session))
        .order_by(JornadaFinanciera.fecha.desc())
        .first()
    )


def require_jornada_abierta(session):
    jornada = obtener_jornada_actual(session, incluir_vencida=False)
    if not jornada:
        raise HTTPException(
            status_code=409,
            detail="Debes abrir la jornada financiera de hoy antes de registrar movimientos de dinero.",
        )
    return jornada


def abrir_jornada_actual(session, current_user: Usuario, observacion: str | None = None):
    vencer_jornadas_antiguas(session)
    jornada_existente = session.query(JornadaFinanciera).filter(JornadaFinanciera.fecha == hoy_jornada(session)).first()
    if jornada_existente and jornada_existente.estado == "ABIERTA":
        return jornada_existente
    if jornada_existente:
        jornada_existente.estado = "ABIERTA"
        jornada_existente.fecha_hora_apertura = ahora_negocio(session)
        jornada_existente.usuario_apertura_id = current_user.id
        jornada_existente.usuario_apertura_nombre = current_user.nombre_completo
        jornada_existente.observacion_apertura = observacion.strip() if observacion else None
        session.flush()
        return jornada_existente

    jornada = JornadaFinanciera(
        fecha=hoy_jornada(session),
        estado="ABIERTA",
        fecha_hora_apertura=ahora_negocio(session),
        usuario_apertura_id=current_user.id,
        usuario_apertura_nombre=current_user.nombre_completo,
        observacion_apertura=observacion.strip() if observacion else None,
    )
    session.add(jornada)
    session.flush()
    return jornada


def _clasificar_movimiento(origen: str, movimiento) -> str:
    if getattr(movimiento, "grupo_pago_id", None) and str(getattr(movimiento, "grupo_pago_id")).startswith("TRF-"):
        return "TRANSFERENCIA_INTERNA"
    if getattr(movimiento, "deposito_banco_id", None):
        return "TRANSFERENCIA_INTERNA"
    if getattr(movimiento, "pago_venta_id", None):
        return "COBRO_VENTA"
    if getattr(movimiento, "pago_compra_id", None):
        return "PAGO_COMPRA"
    if getattr(movimiento, "gasto_operativo_id", None):
        return "GASTO_OPERATIVO"
    if movimiento.tipo == "AJUSTE":
        return "AJUSTE"
    return f"MOVIMIENTO_{origen}"


def _ruta_origen_movimiento(categoria: str) -> str | None:
    if categoria == "COBRO_VENTA":
        return "/ventas"
    if categoria == "PAGO_COMPRA":
        return "/compras"
    if categoria == "GASTO_OPERATIVO":
        return "/gastos"
    if categoria in {"TRANSFERENCIA_INTERNA", "AJUSTE", "MOVIMIENTO_CAJA", "MOVIMIENTO_BANCO"}:
        return "/caja"
    return "/finanzas/jornada"


def _normalizar_medio(origen: str, movimiento, categoria: str) -> str:
    if categoria == "TRANSFERENCIA_INTERNA":
        return "TRANSFERENCIA INTERNA"
    if categoria == "AJUSTE":
        return "AJUSTE"

    metodo = None
    if getattr(movimiento, "pago_venta_rel", None):
        metodo = getattr(movimiento.pago_venta_rel, "metodo_pago", None)
    elif getattr(movimiento, "pago_compra_rel", None):
        metodo = getattr(movimiento.pago_compra_rel, "metodo_pago", None)
    elif getattr(movimiento, "gasto_operativo_id", None) and getattr(movimiento, "gasto_operativo_rel", None):
        metodo = getattr(movimiento.gasto_operativo_rel, "metodo_pago", None)
    elif hasattr(movimiento, "metodo_pago"):
        metodo = getattr(movimiento, "metodo_pago", None)

    metodo_normalizado = (metodo or "").strip().upper()
    aliases = {
        "EFECTIVO": "EFECTIVO",
        "CASH": "EFECTIVO",
        "TARJETA": "TARJETA",
        "TRANSFERENCIA": "TRANSFERENCIA",
        "TRANSFERENCIA BANCARIA": "TRANSFERENCIA",
        "CHEQUE": "CHEQUE",
        "DEPOSITO": "DEPOSITO",
    }
    if metodo_normalizado in aliases:
        return aliases[metodo_normalizado]

    if origen == "CAJA":
        return "EFECTIVO"
    if origen == "BANCO":
        return "BANCO"
    return "OTRO"


def construir_desglose_por_medio(movimientos: list[MovimientoJornadaNormalizado]) -> list[dict]:
    acumulado: dict[str, dict] = {}
    orden = {
        "EFECTIVO": 0,
        "TARJETA": 1,
        "TRANSFERENCIA": 2,
        "CHEQUE": 3,
        "DEPOSITO": 4,
        "BANCO": 5,
        "AJUSTE": 6,
        "TRANSFERENCIA INTERNA": 7,
        "OTRO": 99,
    }

    for movimiento in movimientos:
        if not movimiento.incluye_en_totales:
            continue
        medio = movimiento.medio or "OTRO"
        bucket = acumulado.setdefault(
            medio,
            {
                "medio": medio,
                "ingresos": 0.0,
                "egresos": 0.0,
                "neto": 0.0,
                "cantidad_movimientos": 0,
            },
        )
        bucket["cantidad_movimientos"] += 1
        if movimiento.tipo in {"INGRESO", "AJUSTE (+)"}:
            bucket["ingresos"] += float(movimiento.monto or 0.0)
        elif movimiento.tipo in {"EGRESO", "GASTO", "AJUSTE (-)"}:
            bucket["egresos"] += float(movimiento.monto or 0.0)

    for bucket in acumulado.values():
        bucket["neto"] = float(bucket["ingresos"] - bucket["egresos"])

    return sorted(acumulado.values(), key=lambda item: (orden.get(item["medio"], 90), item["medio"]))


def _normalizar_movimientos_caja(movimientos: list[MovimientoCaja], tz: tzinfo) -> list[MovimientoJornadaNormalizado]:
    normalizados: list[MovimientoJornadaNormalizado] = []
    for movimiento in movimientos:
        categoria = _clasificar_movimiento("CAJA", movimiento)
        incluye_en_totales = categoria != "TRANSFERENCIA_INTERNA"
        pago_venta = getattr(movimiento, "pago_venta_rel", None)
        venta = getattr(pago_venta, "venta_rel", None) if pago_venta else None
        cliente = getattr(venta, "cliente_rel", None) if venta else None
        if movimiento.tipo == "INGRESO":
            tipo = "INGRESO"
            monto = movimiento.monto
        elif movimiento.tipo in {"EGRESO", "GASTO"}:
            tipo = "EGRESO"
            monto = abs(movimiento.monto)
        elif movimiento.tipo == "AJUSTE":
            if movimiento.monto >= 0:
                tipo = "AJUSTE (+)"
                monto = movimiento.monto
            else:
                tipo = "AJUSTE (-)"
                monto = abs(movimiento.monto)
        else:
            tipo = movimiento.tipo
            monto = abs(movimiento.monto)

        normalizados.append(
            MovimientoJornadaNormalizado(
                fecha=movimiento.fecha,
                instante_corte=_instante_movimiento_sql_least(movimiento, tz),
                origen="CAJA",
                categoria=categoria,
                medio=_normalizar_medio("CAJA", movimiento, categoria),
                concepto=movimiento.concepto or "",
                monto=float(monto or 0.0),
                tipo=tipo,
                referencia=f"Caja #{movimiento.id}",
                banco_id=None,
                banco_nombre=None,
                ruta_origen=_ruta_origen_movimiento(categoria),
                incluye_en_totales=incluye_en_totales,
                movimiento_id=movimiento.id,
                venta_id=venta.id if venta else None,
                venta_codigo=venta.codigo if venta else None,
                cliente_nombre=cliente.nombre if cliente else None,
                pago_id=pago_venta.id if pago_venta else None,
            )
        )
    return normalizados


def _mapear_tipo_monto_banco(movimiento: MovimientoBanco) -> tuple[str, float]:
    """Unifica tipos de banco (legacy o variantes) para totales, desglose y PDF."""
    raw = (movimiento.tipo or "").strip().upper()
    monto_crudo = float(movimiento.monto or 0.0)
    abs_m = abs(monto_crudo)

    if raw == "AJUSTE":
        if monto_crudo >= 0:
            return "AJUSTE (+)", abs_m
        return "AJUSTE (-)", abs_m

    if raw in {"EGRESO", "GASTO", "DEBITO", "DEB", "SALIDA", "EGRESOS"}:
        return "EGRESO", abs_m
    if raw in {"INGRESO", "CREDITO", "CRE", "ENTRADA", "INGRESOS"}:
        return "INGRESO", abs_m

    if raw in {"", "MOVIMIENTO", "OTRO"}:
        try:
            sa = float(movimiento.saldo_anterior)
            sn = float(movimiento.saldo_nuevo)
            if sn < sa - 1e-9:
                return "EGRESO", abs_m
            if sn > sa + 1e-9:
                return "INGRESO", abs_m
        except (TypeError, ValueError):
            pass
        if getattr(movimiento, "gasto_operativo_id", None) or getattr(movimiento, "pago_compra_id", None):
            return "EGRESO", abs_m
        if getattr(movimiento, "pago_venta_id", None):
            return "INGRESO", abs_m

    if "EGRES" in raw and "INGRES" not in raw:
        return "EGRESO", abs_m
    if "INGRES" in raw or "CRED" in raw:
        return "INGRESO", abs_m

    return (
        "EGRESO"
        if (getattr(movimiento, "gasto_operativo_id", None) or getattr(movimiento, "pago_compra_id", None))
        else "INGRESO",
        abs_m,
    )


def _normalizar_movimientos_banco(movimientos: list[MovimientoBanco], tz: tzinfo) -> list[MovimientoJornadaNormalizado]:
    normalizados: list[MovimientoJornadaNormalizado] = []
    for movimiento in movimientos:
        categoria = _clasificar_movimiento("BANCO", movimiento)
        incluye_en_totales = categoria != "TRANSFERENCIA_INTERNA"
        pago_venta = getattr(movimiento, "pago_venta_rel", None)
        venta = getattr(pago_venta, "venta_rel", None) if pago_venta else None
        cliente = getattr(venta, "cliente_rel", None) if venta else None
        tipo, monto = _mapear_tipo_monto_banco(movimiento)
        normalizados.append(
            MovimientoJornadaNormalizado(
                fecha=movimiento.fecha,
                instante_corte=_instante_movimiento_sql_least(movimiento, tz),
                origen="BANCO",
                categoria=categoria,
                medio=_normalizar_medio("BANCO", movimiento, categoria),
                concepto=movimiento.concepto or "",
                monto=float(monto),
                tipo=tipo,
                referencia=f"Banco #{movimiento.id}",
                banco_id=movimiento.banco_id,
                banco_nombre=movimiento.banco_rel.nombre_banco if movimiento.banco_rel else None,
                ruta_origen=_ruta_origen_movimiento(categoria),
                incluye_en_totales=incluye_en_totales,
                movimiento_id=movimiento.id,
                venta_id=venta.id if venta else None,
                venta_codigo=venta.codigo if venta else None,
                cliente_nombre=cliente.nombre if cliente else None,
                pago_id=pago_venta.id if pago_venta else None,
            )
        )
    return normalizados


def _normalizar_fecha_hasta_corte(fecha_hasta: datetime, tz: tzinfo) -> datetime:
    """Alinea tope de corte con instante_corte (naive hora de negocio)."""
    if getattr(fecha_hasta, "tzinfo", None) is not None:
        return fecha_hasta.astimezone(tz).replace(tzinfo=None)
    return fecha_hasta


def obtener_movimientos_normalizados_jornada(
    session,
    jornada: JornadaFinanciera | None,
    *,
    fecha_desde: datetime | None = None,
    fecha_hasta: datetime | None = None,
) -> list[MovimientoJornadaNormalizado]:
    if not jornada:
        return []
    tz = _zona_horaria_negocio(session)

    query_caja = session.query(MovimientoCaja).filter(MovimientoCaja.jornada_id == jornada.id)
    query_banco = session.query(MovimientoBanco).filter(MovimientoBanco.jornada_id == jornada.id)
    if fecha_desde:
        query_caja = query_caja.filter(MovimientoCaja.fecha >= fecha_desde)
        query_banco = query_banco.filter(MovimientoBanco.fecha >= fecha_desde)
    # No filtrar fecha_hasta en SQL: created_at es UTC naive y fecha_hora_corte es hora local de negocio;
    # en PostgreSQL la comparacion naive mezcla zonas y puede excluir todos los movimientos (PDF/resumen en cero).
    # Misma regla que instante_corte en Python (_instante_movimiento_sql_least).

    query_caja = query_caja.options(
        selectinload(MovimientoCaja.pago_venta_rel).selectinload(Pago.venta_rel).selectinload(Venta.cliente_rel),
        selectinload(MovimientoCaja.pago_compra_rel),
        selectinload(MovimientoCaja.gasto_operativo_rel),
    )
    query_banco = query_banco.options(
        selectinload(MovimientoBanco.pago_venta_rel).selectinload(Pago.venta_rel).selectinload(Venta.cliente_rel),
        selectinload(MovimientoBanco.pago_compra_rel),
        selectinload(MovimientoBanco.banco_rel),
    )

    movimientos = [
        *_normalizar_movimientos_caja(query_caja.all(), tz),
        *_normalizar_movimientos_banco(query_banco.all(), tz),
    ]
    if fecha_hasta:
        tope = _normalizar_fecha_hasta_corte(fecha_hasta, tz)
        movimientos = [m for m in movimientos if m.instante_corte <= tope]
    return sorted(movimientos, key=lambda item: item.fecha, reverse=True)


def cargar_movimientos_jornada_normalizados(session, jornada: JornadaFinanciera | None) -> list[MovimientoJornadaNormalizado]:
    """Todos los movimientos normalizados de la jornada (una pasada DB con eager loads)."""
    return obtener_movimientos_normalizados_jornada(session, jornada)


def construir_resumen_jornada_desde_cache(movimientos: list[MovimientoJornadaNormalizado]) -> dict:
    """Totales del día a partir de movimientos ya normalizados (evita otra query)."""
    return _totales_desde_movimientos_normalizados(movimientos)


def _totales_desde_movimientos_normalizados(movimientos: list[MovimientoJornadaNormalizado]) -> dict:
    ingresos = 0.0
    egresos = 0.0
    movimientos_caja = 0
    movimientos_banco = 0
    for movimiento in movimientos:
        if not movimiento.incluye_en_totales:
            continue
        if movimiento.origen == "CAJA":
            movimientos_caja += 1
        elif movimiento.origen == "BANCO":
            movimientos_banco += 1
        if movimiento.tipo in {"INGRESO", "AJUSTE (+)"}:
            ingresos += movimiento.monto
        elif movimiento.tipo in {"EGRESO", "GASTO", "AJUSTE (-)"}:
            egresos += movimiento.monto
    return {
        "ingresos": float(ingresos),
        "egresos": float(egresos),
        "neto": float(ingresos - egresos),
        "movimientos_caja": int(movimientos_caja),
        "movimientos_banco": int(movimientos_banco),
        "movimientos_total": int(movimientos_caja) + int(movimientos_banco),
    }


def serializar_movimiento_jornada(movimiento: MovimientoJornadaNormalizado) -> dict:
    return {
        "fecha": movimiento.fecha,
        "instante_corte": movimiento.instante_corte,
        "origen": movimiento.origen,
        "categoria": movimiento.categoria,
        "medio": movimiento.medio,
        "concepto": movimiento.concepto,
        "monto": float(movimiento.monto or 0.0),
        "tipo": movimiento.tipo,
        "referencia": movimiento.referencia,
        "banco_id": movimiento.banco_id,
        "banco_nombre": movimiento.banco_nombre,
        "ruta_origen": movimiento.ruta_origen,
        "incluye_en_totales": bool(movimiento.incluye_en_totales),
        "movimiento_id": movimiento.movimiento_id,
        "venta_id": movimiento.venta_id,
        "venta_codigo": movimiento.venta_codigo,
        "cliente_nombre": movimiento.cliente_nombre,
        "pago_id": movimiento.pago_id,
    }


def construir_detalle_ventas_jornada(
    session,
    jornada: JornadaFinanciera | None,
    movimientos: list[MovimientoJornadaNormalizado],
) -> dict:
    if not jornada:
        return {
            "items": [],
            "cantidad_ventas": 0,
            "total_ventas": 0.0,
            "total_efectivo": 0.0,
            "total_transferencia": 0.0,
            "total_tarjeta": 0.0,
            "total_otros": 0.0,
            "total_cobrado": 0.0,
            "total_pendiente": 0.0,
        }

    fecha_desde = datetime.combine(jornada.fecha, time.min)
    fecha_hasta = datetime.combine(jornada.fecha, time.max)
    ventas = (
        session.query(Venta)
        .filter(
            Venta.fecha >= fecha_desde,
            Venta.fecha <= fecha_hasta,
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
        )
        .options(
            selectinload(Venta.cliente_rel),
        )
        .order_by(Venta.fecha.desc(), Venta.id.desc())
        .all()
    )

    pagos_por_venta: dict[int, list[MovimientoJornadaNormalizado]] = {}
    for movimiento in movimientos:
        if movimiento.venta_id and movimiento.incluye_en_totales and movimiento.tipo in {"INGRESO", "AJUSTE (+)"}:
            pagos_por_venta.setdefault(movimiento.venta_id, []).append(movimiento)

    items: list[dict] = []
    totales = {
        "total_ventas": 0.0,
        "total_efectivo": 0.0,
        "total_transferencia": 0.0,
        "total_tarjeta": 0.0,
        "total_otros": 0.0,
        "total_cobrado": 0.0,
        "total_pendiente": 0.0,
    }
    for venta in ventas:
        pagos = pagos_por_venta.get(venta.id, [])
        efectivo = float(sum(m.monto for m in pagos if m.medio == "EFECTIVO"))
        transferencia = float(sum(m.monto for m in pagos if m.medio in {"TRANSFERENCIA", "BANCO", "DEPOSITO"}))
        tarjeta = float(sum(m.monto for m in pagos if m.medio == "TARJETA"))
        otros = float(sum(m.monto for m in pagos if m.medio not in {"EFECTIVO", "TRANSFERENCIA", "BANCO", "DEPOSITO", "TARJETA"}))
        cobrado = efectivo + transferencia + tarjeta + otros
        pendiente = float(max(0.0, venta.saldo or 0.0))
        total = float(venta.total or 0.0)
        cliente = getattr(venta, "cliente_rel", None)

        totales["total_ventas"] += total
        totales["total_efectivo"] += efectivo
        totales["total_transferencia"] += transferencia
        totales["total_tarjeta"] += tarjeta
        totales["total_otros"] += otros
        totales["total_cobrado"] += cobrado
        totales["total_pendiente"] += pendiente

        items.append(
            {
                "venta_id": venta.id,
                "venta_codigo": venta.codigo,
                "fecha": venta.fecha,
                "cliente_nombre": cliente.nombre if cliente else None,
                "estado": venta.estado,
                "total": total,
                "efectivo": efectivo,
                "transferencia": transferencia,
                "tarjeta": tarjeta,
                "otros": otros,
                "cobrado": cobrado,
                "pendiente": pendiente,
                "cantidad_pagos": len(pagos),
                "movimientos": [serializar_movimiento_jornada(m) for m in sorted(pagos, key=lambda item: item.fecha)],
            }
        )

    return {
        "items": items,
        "cantidad_ventas": len(items),
        **{key: float(value) for key, value in totales.items()},
    }


def construir_resumen_jornada(
    session,
    jornada: JornadaFinanciera | None,
    *,
    fecha_hasta: datetime | None = None,
) -> dict:
    if not jornada:
        return {
            "ingresos": 0.0,
            "egresos": 0.0,
            "neto": 0.0,
            "movimientos_caja": 0,
            "movimientos_banco": 0,
            "movimientos_total": 0,
        }

    movimientos = obtener_movimientos_normalizados_jornada(session, jornada, fecha_hasta=fecha_hasta)
    return _totales_desde_movimientos_normalizados(movimientos)


def _metricas_ventas_para_fecha(session, fecha_dia: date, *, fecha_hasta: datetime | None = None) -> dict:
    fecha_desde = datetime.combine(fecha_dia, time.min)
    limite_hasta = fecha_hasta or datetime.combine(fecha_dia, time.max)
    ventas_dia = (
        session.query(Venta)
        .filter(
            Venta.fecha >= fecha_desde,
            Venta.fecha <= limite_hasta,
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
        )
        .all()
    )
    ventas_con_saldo = [venta for venta in ventas_dia if (venta.saldo or 0) > 0]
    total_pendiente = float(sum(venta.saldo or 0.0 for venta in ventas_con_saldo))
    total_ventas_con_saldo = float(sum(venta.total or 0.0 for venta in ventas_con_saldo))
    total_cobrado_ventas_con_saldo = float(
        sum(max(0.0, float((venta.total or 0.0) - (venta.saldo or 0.0))) for venta in ventas_con_saldo)
    )
    venta_total_dia = float(sum(venta.total or 0.0 for venta in ventas_dia))
    return {
        "total_pendiente": total_pendiente,
        "cantidad_ventas_con_saldo": len(ventas_con_saldo),
        "total_ventas_con_saldo": total_ventas_con_saldo,
        "total_cobrado_ventas_con_saldo": total_cobrado_ventas_con_saldo,
        "venta_total_dia": venta_total_dia,
        "cantidad_ventas_dia": len(ventas_dia),
    }


def _metricas_ventas_para_fechas(session, fechas: list[date]) -> dict[date, dict]:
    """Calcula métricas por día en una sola query para varias fechas de historial."""
    if not fechas:
        return {}

    fecha_min = min(fechas)
    fecha_max = max(fechas)
    desde = datetime.combine(fecha_min, time.min)
    hasta = datetime.combine(fecha_max, time.max)

    saldo_col = func.coalesce(Venta.saldo, 0.0)
    total_col = func.coalesce(Venta.total, 0.0)
    saldo_positivo = saldo_col > 0
    dia_col = func.date(Venta.fecha)

    rows = (
        session.query(
            dia_col.label("dia"),
            func.sum(case((saldo_positivo, saldo_col), else_=0.0)).label("total_pendiente"),
            func.sum(case((saldo_positivo, 1), else_=0)).label("cantidad_ventas_con_saldo"),
            func.sum(case((saldo_positivo, total_col), else_=0.0)).label("total_ventas_con_saldo"),
            func.sum(case((saldo_positivo, func.greatest(0.0, total_col - saldo_col)), else_=0.0)).label(
                "total_cobrado_ventas_con_saldo"
            ),
            func.sum(total_col).label("venta_total_dia"),
            func.count(Venta.id).label("cantidad_ventas_dia"),
        )
        .filter(
            Venta.fecha >= desde,
            Venta.fecha <= hasta,
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
        )
        .group_by(dia_col)
        .all()
    )

    out: dict[date, dict] = {}
    for row in rows:
        dia = row.dia
        if isinstance(dia, datetime):
            dia = dia.date()
        elif isinstance(dia, str):
            dia = date.fromisoformat(dia)
        out[dia] = {
            "total_pendiente": float(row.total_pendiente or 0.0),
            "cantidad_ventas_con_saldo": int(row.cantidad_ventas_con_saldo or 0),
            "total_ventas_con_saldo": float(row.total_ventas_con_saldo or 0.0),
            "total_cobrado_ventas_con_saldo": float(row.total_cobrado_ventas_con_saldo or 0.0),
            "venta_total_dia": float(row.venta_total_dia or 0.0),
            "cantidad_ventas_dia": int(row.cantidad_ventas_dia or 0),
        }

    for fd in fechas:
        out.setdefault(
            fd,
            {
                "total_pendiente": 0.0,
                "cantidad_ventas_con_saldo": 0,
                "total_ventas_con_saldo": 0.0,
                "total_cobrado_ventas_con_saldo": 0.0,
                "venta_total_dia": 0.0,
                "cantidad_ventas_dia": 0,
            },
        )
    return out


def construir_metricas_ventas_dia(session, jornada: JornadaFinanciera | None, *, fecha_hasta: datetime | None = None):
    if not jornada:
        return {
            "total_pendiente": 0.0,
            "cantidad_ventas_con_saldo": 0,
            "total_ventas_con_saldo": 0.0,
            "total_cobrado_ventas_con_saldo": 0.0,
            "venta_total_dia": 0.0,
            "cantidad_ventas_dia": 0,
        }
    return _metricas_ventas_para_fecha(session, jornada.fecha, fecha_hasta=fecha_hasta)


def _saldo_actual_caja(session) -> float:
    caja = session.query(ConfiguracionCaja).first()
    return float(caja.saldo_actual or 0.0) if caja else 0.0


def _saldo_actual_bancos(session) -> float:
    return float(
        session.query(func.coalesce(func.sum(Banco.saldo_actual), 0.0)).scalar() or 0.0
    )


def obtener_ultimo_corte_jornada(session, jornada_id: int | None):
    if not jornada_id:
        return None
    return (
        session.query(CorteJornadaFinanciera)
        .filter(CorteJornadaFinanciera.jornada_id == jornada_id)
        .order_by(CorteJornadaFinanciera.fecha_hora_corte.desc(), CorteJornadaFinanciera.id.desc())
        .first()
    )


def obtener_ultima_rendicion_vigente(session, jornada_id: int | None):
    if not jornada_id:
        return None
    return (
        session.query(RendicionJornadaFinanciera)
        .filter(
            RendicionJornadaFinanciera.jornada_id == jornada_id,
            RendicionJornadaFinanciera.estado == "VIGENTE",
        )
        .order_by(RendicionJornadaFinanciera.fecha_hora_rendicion.desc(), RendicionJornadaFinanciera.id.desc())
        .first()
    )


def crear_corte_jornada_actual(session, jornada: JornadaFinanciera, current_user: Usuario):
    fecha_corte = ahora_negocio(session)
    # Misma ventana que el PDF del corte: movimientos con fecha <= hora del corte
    resumen = construir_resumen_jornada(session, jornada, fecha_hasta=fecha_corte)
    corte = CorteJornadaFinanciera(
        jornada_id=jornada.id,
        fecha_hora_corte=fecha_corte,
        usuario_id=current_user.id,
        usuario_nombre=current_user.nombre_completo,
        ingresos=resumen["ingresos"],
        egresos=resumen["egresos"],
        neto=resumen["neto"],
        movimientos_caja=resumen["movimientos_caja"],
        movimientos_banco=resumen["movimientos_banco"],
        movimientos_total=resumen["movimientos_total"],
        saldo_actual_caja=_saldo_actual_caja(session),
        saldo_actual_bancos=_saldo_actual_bancos(session),
        saldo_final_total=_saldo_actual_caja(session) + _saldo_actual_bancos(session),
    )
    session.add(corte)
    session.flush()
    return corte


def construir_resumen_corte(session, corte: CorteJornadaFinanciera):
    jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == corte.jornada_id).first()
    movimientos = obtener_movimientos_normalizados_jornada(session, jornada, fecha_hasta=corte.fecha_hora_corte)
    metricas_ventas = construir_metricas_ventas_dia(session, jornada, fecha_hasta=corte.fecha_hora_corte)
    ingresos = [mov for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"INGRESO", "AJUSTE (+)"}]
    egresos = [mov for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"EGRESO", "GASTO", "AJUSTE (-)"}]
    total_ingresos = float(sum(mov.monto for mov in ingresos))
    total_egresos = float(sum(mov.monto for mov in egresos))
    resultado_neto = float(total_ingresos - total_egresos)
    margen = (resultado_neto / total_ingresos * 100) if total_ingresos > 0 else 0.0
    ingresos_caja = float(sum(mov.monto for mov in ingresos if mov.origen == "CAJA"))
    ingresos_banco = float(sum(mov.monto for mov in ingresos if mov.origen == "BANCO"))
    egresos_caja = float(sum(mov.monto for mov in egresos if mov.origen == "CAJA"))
    egresos_banco = float(sum(mov.monto for mov in egresos if mov.origen == "BANCO"))
    return SimpleNamespace(
        total_ingresos=total_ingresos,
        total_egresos=total_egresos,
        resultado_neto=resultado_neto,
        margen=margen,
        ingresos_caja=ingresos_caja,
        ingresos_banco=ingresos_banco,
        egresos_caja=egresos_caja,
        egresos_banco=egresos_banco,
        saldo_actual_caja=float(corte.saldo_actual_caja or 0.0),
        saldo_actual_bancos=float(corte.saldo_actual_bancos or 0.0),
        saldo_final_total=float(corte.saldo_final_total or 0.0),
        cuentas_por_cobrar_dia=float(metricas_ventas["total_pendiente"]),
        cantidad_ventas_cobrar_dia=int(metricas_ventas["cantidad_ventas_con_saldo"]),
        total_ventas_con_saldo=float(metricas_ventas["total_ventas_con_saldo"]),
        total_cobrado_ventas_con_saldo=float(metricas_ventas["total_cobrado_ventas_con_saldo"]),
        venta_total_dia=float(metricas_ventas["venta_total_dia"]),
        cantidad_ventas_dia=int(metricas_ventas["cantidad_ventas_dia"]),
        desglose_medios=construir_desglose_por_medio(movimientos),
        ingresos=ingresos,
        egresos=egresos,
        todos=movimientos,
    )


def serializar_corte(session, corte: CorteJornadaFinanciera):
    jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == corte.jornada_id).first()
    ultimo = obtener_ultimo_corte_jornada(session, corte.jornada_id)
    resumen = construir_resumen_corte(session, corte)
    tot = _totales_desde_movimientos_normalizados(resumen.todos)
    return {
        "id": corte.id,
        "jornada_id": corte.jornada_id,
        "fecha": jornada.fecha if jornada else hoy_jornada(session),
        "fecha_hora_corte": corte.fecha_hora_corte,
        "usuario_id": corte.usuario_id,
        "usuario_nombre": corte.usuario_nombre,
        "ingresos": tot["ingresos"],
        "egresos": tot["egresos"],
        "neto": tot["neto"],
        "movimientos_caja": tot["movimientos_caja"],
        "movimientos_banco": tot["movimientos_banco"],
        "movimientos_total": tot["movimientos_total"],
        "saldo_actual_caja": float(corte.saldo_actual_caja or 0.0),
        "saldo_actual_bancos": float(corte.saldo_actual_bancos or 0.0),
        "saldo_final_total": float(corte.saldo_final_total or 0.0),
        "desglose_medios": resumen.desglose_medios,
        "es_ultimo": bool(ultimo and ultimo.id == corte.id),
    }


def serializar_cortes_jornada_lista(
    session,
    jornada: JornadaFinanciera,
    cortes: list[CorteJornadaFinanciera],
    *,
    movimientos_cache: list[MovimientoJornadaNormalizado] | None = None,
) -> list[dict]:
    """Lista de cortes para la UI: una sola carga de movimientos y sin N× construir_resumen_corte."""
    if not cortes:
        return []
    ultimo_id = cortes[0].id
    all_movs = (
        list(movimientos_cache)
        if movimientos_cache is not None
        else cargar_movimientos_jornada_normalizados(session, jornada)
    )
    fecha_jornada = jornada.fecha
    out: list[dict] = []
    for corte in cortes:
        sub = [m for m in all_movs if m.instante_corte <= corte.fecha_hora_corte]
        desglose = construir_desglose_por_medio(sub)
        tot = _totales_desde_movimientos_normalizados(sub)
        out.append(
            {
                "id": corte.id,
                "jornada_id": corte.jornada_id,
                "fecha": fecha_jornada,
                "fecha_hora_corte": corte.fecha_hora_corte,
                "usuario_id": corte.usuario_id,
                "usuario_nombre": corte.usuario_nombre,
                "ingresos": tot["ingresos"],
                "egresos": tot["egresos"],
                "neto": tot["neto"],
                "movimientos_caja": tot["movimientos_caja"],
                "movimientos_banco": tot["movimientos_banco"],
                "movimientos_total": tot["movimientos_total"],
                "saldo_actual_caja": float(corte.saldo_actual_caja or 0.0),
                "saldo_actual_bancos": float(corte.saldo_actual_bancos or 0.0),
                "saldo_final_total": float(corte.saldo_final_total or 0.0),
                "desglose_medios": desglose,
                "es_ultimo": corte.id == ultimo_id,
            }
        )
    return out


def construir_pendiente_rendicion(
    session,
    jornada: JornadaFinanciera | None,
    *,
    movimientos_dia_cache: list[MovimientoJornadaNormalizado] | None = None,
):
    if not jornada:
        return {
            "monto_sugerido": 0.0,
            "cantidad_movimientos": 0,
            "ingresos": 0.0,
            "egresos": 0.0,
            "fecha_desde": None,
            "desglose_medios": [],
            "movimientos": [],
            "ventas_pendientes": [],
        }

    ultima_rendicion = obtener_ultima_rendicion_vigente(session, jornada.id)
    fecha_desde = ultima_rendicion.fecha_hora_rendicion if ultima_rendicion else None
    if movimientos_dia_cache is not None:
        movimientos_dia = list(movimientos_dia_cache)
        movimientos = list(movimientos_dia_cache)
        if fecha_desde:
            movimientos = [mov for mov in movimientos if mov.fecha > fecha_desde]
    else:
        movimientos_dia = obtener_movimientos_normalizados_jornada(session, jornada)
        movimientos = obtener_movimientos_normalizados_jornada(session, jornada, fecha_desde=fecha_desde)
        if fecha_desde:
            movimientos = [mov for mov in movimientos if mov.fecha > fecha_desde]

    ingresos = float(sum(mov.monto for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"INGRESO", "AJUSTE (+)"}))
    egresos = float(sum(mov.monto for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"EGRESO", "GASTO", "AJUSTE (-)"}))
    monto_sugerido = ingresos - egresos
    cantidad_movimientos = len([mov for mov in movimientos if mov.incluye_en_totales])
    ventas_detalle = construir_detalle_ventas_jornada(session, jornada, movimientos_dia)
    ventas_pendientes_por_id = {
        int(venta["venta_id"]): {
            "venta_id": venta["venta_id"],
            "venta_codigo": venta["venta_codigo"],
            "cliente_nombre": venta["cliente_nombre"],
            "total": venta["total"],
            "cobrado": venta["cobrado"],
            "pendiente": venta["pendiente"],
            "efectivo": venta["efectivo"],
            "transferencia": venta["transferencia"],
            "tarjeta": venta["tarjeta"],
            "otros": venta["otros"],
        }
        for venta in ventas_detalle.get("items", [])
        if float(venta.get("pendiente") or 0.0) > 0.009
    }

    venta_ids_en_movimientos = {int(mov.venta_id) for mov in movimientos if mov.venta_id}
    venta_ids_faltantes = venta_ids_en_movimientos.difference(ventas_pendientes_por_id.keys())
    if venta_ids_faltantes:
        ventas_relacionadas = (
            session.query(Venta)
            .filter(Venta.id.in_(venta_ids_faltantes))
            .options(selectinload(Venta.cliente_rel))
            .all()
        )
        movimientos_por_venta: dict[int, list[MovimientoJornadaNormalizado]] = {}
        for mov in movimientos:
            if mov.venta_id:
                movimientos_por_venta.setdefault(int(mov.venta_id), []).append(mov)

        for venta in ventas_relacionadas:
            pendiente_venta = float(max(0.0, venta.saldo or 0.0))
            if pendiente_venta <= 0.009:
                continue
            pagos = [
                mov
                for mov in movimientos_por_venta.get(int(venta.id), [])
                if mov.incluye_en_totales and mov.tipo in {"INGRESO", "AJUSTE (+)"}
            ]
            efectivo = float(sum(m.monto for m in pagos if m.medio == "EFECTIVO"))
            transferencia = float(sum(m.monto for m in pagos if m.medio in {"TRANSFERENCIA", "BANCO", "DEPOSITO"}))
            tarjeta = float(sum(m.monto for m in pagos if m.medio == "TARJETA"))
            otros = float(sum(m.monto for m in pagos if m.medio not in {"EFECTIVO", "TRANSFERENCIA", "BANCO", "DEPOSITO", "TARJETA"}))
            total_venta = float(venta.total or 0.0)
            cliente = getattr(venta, "cliente_rel", None)
            ventas_pendientes_por_id[int(venta.id)] = {
                "venta_id": venta.id,
                "venta_codigo": venta.codigo,
                "cliente_nombre": cliente.nombre if cliente else None,
                "total": total_venta,
                "cobrado": float(max(0.0, total_venta - pendiente_venta)),
                "pendiente": pendiente_venta,
                "efectivo": efectivo,
                "transferencia": transferencia,
                "tarjeta": tarjeta,
                "otros": otros,
            }

    ventas_pendientes = sorted(
        ventas_pendientes_por_id.values(),
        key=lambda item: (str(item.get("venta_codigo") or ""), int(item.get("venta_id") or 0)),
    )
    return {
        "monto_sugerido": float(monto_sugerido),
        "cantidad_movimientos": cantidad_movimientos,
        "ingresos": ingresos,
        "egresos": egresos,
        "fecha_desde": fecha_desde,
        "desglose_medios": construir_desglose_por_medio(movimientos),
        "movimientos": [serializar_movimiento_jornada(mov) for mov in sorted(movimientos, key=lambda item: item.fecha, reverse=True)],
        "ventas_pendientes": ventas_pendientes,
    }


def construir_cuentas_por_cobrar_dia(session, jornada: JornadaFinanciera | None, *, fecha_hasta: datetime | None = None):
    metricas = construir_metricas_ventas_dia(session, jornada, fecha_hasta=fecha_hasta)
    return {
        "total_pendiente": float(metricas["total_pendiente"]),
        "cantidad_ventas": int(metricas["cantidad_ventas_con_saldo"]),
        "total_ventas": float(metricas["total_ventas_con_saldo"]),
        "total_cobrado": float(metricas["total_cobrado_ventas_con_saldo"]),
    }


def obtener_movimientos_pendientes_rendir(session, jornada: JornadaFinanciera | None):
    if not jornada:
        return []
    ultima_rendicion = obtener_ultima_rendicion_vigente(session, jornada.id)
    fecha_desde = ultima_rendicion.fecha_hora_rendicion if ultima_rendicion else None
    movimientos = obtener_movimientos_normalizados_jornada(session, jornada, fecha_desde=fecha_desde)
    if fecha_desde:
        movimientos = [mov for mov in movimientos if mov.fecha > fecha_desde]
    return movimientos


def crear_rendicion_jornada_actual(
    session,
    jornada: JornadaFinanciera,
    current_user: Usuario,
    *,
    destinatario_id: int,
    monto_rendido: float,
    observacion: str | None = None,
):
    pendiente = construir_pendiente_rendicion(session, jornada)
    monto_sugerido = float(pendiente["monto_sugerido"])
    observacion_limpia = observacion.strip() if observacion else None
    if abs(float(monto_rendido) - monto_sugerido) > 0.009 and not observacion_limpia:
        raise HTTPException(
            status_code=422,
            detail="Debes cargar una observación cuando el monto rendido es diferente al sugerido por el sistema.",
        )

    dest = resolver_destinatario_rendicion_activo(session, destinatario_id)
    nombre_dest = (dest.nombre or "").strip()

    rendicion = RendicionJornadaFinanciera(
        jornada_id=jornada.id,
        fecha_hora_rendicion=ahora_negocio(session),
        usuario_id=current_user.id,
        usuario_nombre=current_user.nombre_completo,
        destinatario_rendicion_id=dest.id,
        rendido_a=nombre_dest,
        monto_sugerido=monto_sugerido,
        monto_rendido=float(monto_rendido),
        observacion=observacion_limpia,
        estado="VIGENTE",
    )
    session.add(rendicion)
    session.flush()
    return rendicion


def _recalcular_montos_sugeridos_rendiciones_vigentes(session, jornada_id: int) -> None:
    jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == jornada_id).first()
    if not jornada:
        return

    rendiciones = (
        session.query(RendicionJornadaFinanciera)
        .filter(
            RendicionJornadaFinanciera.jornada_id == jornada_id,
            RendicionJornadaFinanciera.estado == "VIGENTE",
        )
        .order_by(RendicionJornadaFinanciera.fecha_hora_rendicion.asc(), RendicionJornadaFinanciera.id.asc())
        .all()
    )

    fecha_desde = None
    for rendicion in rendiciones:
        movimientos = obtener_movimientos_normalizados_jornada(
            session,
            jornada,
            fecha_desde=fecha_desde,
            fecha_hasta=rendicion.fecha_hora_rendicion,
        )
        if fecha_desde:
            movimientos = [mov for mov in movimientos if mov.fecha > fecha_desde]
        movimientos = [mov for mov in movimientos if mov.fecha <= rendicion.fecha_hora_rendicion]
        ingresos = float(sum(mov.monto for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"INGRESO", "AJUSTE (+)"}))
        egresos = float(sum(mov.monto for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"EGRESO", "GASTO", "AJUSTE (-)"}))
        rendicion.monto_sugerido = float(ingresos - egresos)
        fecha_desde = rendicion.fecha_hora_rendicion

    session.flush()


def actualizar_rendicion_jornada(
    session,
    rendicion: RendicionJornadaFinanciera,
    current_user: Usuario,
    *,
    fecha_hora_rendicion: datetime,
    destinatario_id: int,
    monto_rendido: float,
    observacion: str | None = None,
    motivo_ajuste: str,
):
    if rendicion.estado != "VIGENTE":
        raise HTTPException(status_code=409, detail="Solo se pueden editar rendiciones vigentes.")

    jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == rendicion.jornada_id).first()
    if not jornada:
        raise HTTPException(status_code=404, detail="La jornada de esta rendicion ya no existe.")

    fecha_nueva = _normalizar_datetime_local(fecha_hora_rendicion, _zona_horaria_negocio(session))
    if fecha_nueva > ahora_negocio(session):
        raise HTTPException(status_code=422, detail="La fecha de rendicion no puede quedar en el futuro.")
    if jornada.fecha_hora_apertura and fecha_nueva < jornada.fecha_hora_apertura:
        raise HTTPException(status_code=422, detail="La fecha de rendicion no puede ser anterior a la apertura de la jornada.")

    rendiciones_vigentes = (
        session.query(RendicionJornadaFinanciera)
        .filter(
            RendicionJornadaFinanciera.jornada_id == rendicion.jornada_id,
            RendicionJornadaFinanciera.estado == "VIGENTE",
            RendicionJornadaFinanciera.id != rendicion.id,
        )
        .order_by(RendicionJornadaFinanciera.fecha_hora_rendicion.asc(), RendicionJornadaFinanciera.id.asc())
        .all()
    )
    anterior = None
    siguiente = None
    for item in rendiciones_vigentes:
        if item.fecha_hora_rendicion < fecha_nueva:
            anterior = item
            continue
        if item.fecha_hora_rendicion >= fecha_nueva:
            siguiente = item
            break

    if anterior and fecha_nueva <= anterior.fecha_hora_rendicion:
        raise HTTPException(status_code=422, detail="La fecha de rendicion debe quedar despues de la rendicion vigente anterior.")
    if siguiente and fecha_nueva >= siguiente.fecha_hora_rendicion:
        raise HTTPException(status_code=422, detail="La fecha de rendicion debe quedar antes de la siguiente rendicion vigente.")

    observacion_limpia = observacion.strip() if observacion else None
    motivo_limpio = (motivo_ajuste or "").strip()
    if not motivo_limpio:
        raise HTTPException(status_code=422, detail="Debes indicar el motivo del ajuste.")

    dest = resolver_destinatario_rendicion_activo(session, destinatario_id)
    rendido_a_limpio = (dest.nombre or "").strip()

    if rendicion.fecha_hora_original is None:
        rendicion.fecha_hora_original = rendicion.fecha_hora_rendicion
    if rendicion.rendido_a_original is None:
        rendicion.rendido_a_original = rendicion.rendido_a
    if rendicion.monto_rendido_original is None:
        rendicion.monto_rendido_original = float(rendicion.monto_rendido or 0.0)
    if rendicion.observacion_original is None:
        rendicion.observacion_original = rendicion.observacion

    rendicion.fecha_hora_rendicion = fecha_nueva
    rendicion.destinatario_rendicion_id = dest.id
    rendicion.rendido_a = rendido_a_limpio
    rendicion.monto_rendido = float(monto_rendido)
    rendicion.observacion = observacion_limpia
    rendicion.fecha_hora_ultima_edicion = ahora_negocio(session)
    rendicion.usuario_ultima_edicion_id = current_user.id
    rendicion.usuario_ultima_edicion_nombre = current_user.nombre_completo
    rendicion.motivo_ajuste = motivo_limpio

    _recalcular_montos_sugeridos_rendiciones_vigentes(session, rendicion.jornada_id)

    if abs(float(rendicion.monto_rendido) - float(rendicion.monto_sugerido or 0.0)) > 0.009 and not observacion_limpia:
        raise HTTPException(
            status_code=422,
            detail="Debes cargar una observacion cuando el monto rendido es diferente al sugerido por el sistema.",
        )

    session.flush()
    return rendicion


def construir_desglose_medios_rendicion(
    session,
    rendicion: RendicionJornadaFinanciera,
    todos_movs: list[MovimientoJornadaNormalizado],
) -> list[dict]:
    rendicion_anterior = (
        session.query(RendicionJornadaFinanciera)
        .filter(
            RendicionJornadaFinanciera.jornada_id == rendicion.jornada_id,
            RendicionJornadaFinanciera.estado == "VIGENTE",
            RendicionJornadaFinanciera.fecha_hora_rendicion < rendicion.fecha_hora_rendicion,
        )
        .order_by(RendicionJornadaFinanciera.fecha_hora_rendicion.desc(), RendicionJornadaFinanciera.id.desc())
        .first()
    )
    fecha_desde = rendicion_anterior.fecha_hora_rendicion if rendicion_anterior else None
    movimientos = list(todos_movs)
    if fecha_desde:
        movimientos = [mov for mov in movimientos if mov.fecha > fecha_desde]
    movimientos = [
        mov
        for mov in movimientos
        if mov.instante_corte <= rendicion.fecha_hora_rendicion and mov.fecha <= rendicion.fecha_hora_rendicion
    ]
    return construir_desglose_por_medio(movimientos)


def serializar_rendicion(session, rendicion: RendicionJornadaFinanciera, *, desglose_medios: list[dict] | None = None):
    jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == rendicion.jornada_id).first()
    ultima = obtener_ultima_rendicion_vigente(session, rendicion.jornada_id)
    if desglose_medios is None:
        resumen = construir_resumen_rendicion(session, rendicion)
        desglose_medios = resumen.desglose_medios
    return {
        "id": rendicion.id,
        "jornada_id": rendicion.jornada_id,
        "fecha": jornada.fecha if jornada else hoy_jornada(session),
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
        "desglose_medios": desglose_medios,
        "es_ultima_vigente": bool(ultima and ultima.id == rendicion.id),
        "editada": bool(rendicion.fecha_hora_ultima_edicion),
        "fecha_hora_original": rendicion.fecha_hora_original,
        "rendido_a_original": rendicion.rendido_a_original,
        "monto_rendido_original": float(rendicion.monto_rendido_original or 0.0) if rendicion.monto_rendido_original is not None else None,
        "observacion_original": rendicion.observacion_original,
        "fecha_hora_ultima_edicion": rendicion.fecha_hora_ultima_edicion,
        "usuario_ultima_edicion_nombre": rendicion.usuario_ultima_edicion_nombre,
        "motivo_ajuste": rendicion.motivo_ajuste,
    }


def construir_filas_historial_jornadas(session, jornadas: list[JornadaFinanciera]) -> list[dict]:
    """Una pasada de consultas para N jornadas (evita N× movimientos + ventas)."""
    if not jornadas:
        return []
    tz = _zona_horaria_negocio(session)
    ids = [j.id for j in jornadas]

    caja_rows = (
        session.query(MovimientoCaja)
        .filter(MovimientoCaja.jornada_id.in_(ids))
        .options(
            selectinload(MovimientoCaja.pago_venta_rel),
            selectinload(MovimientoCaja.pago_compra_rel),
            selectinload(MovimientoCaja.gasto_operativo_rel),
        )
        .all()
    )
    banco_rows = (
        session.query(MovimientoBanco)
        .filter(MovimientoBanco.jornada_id.in_(ids))
        .options(
            selectinload(MovimientoBanco.pago_venta_rel),
            selectinload(MovimientoBanco.pago_compra_rel),
            selectinload(MovimientoBanco.banco_rel),
        )
        .all()
    )

    caja_por_j: dict[int, list] = {}
    for m in caja_rows:
        if m.jornada_id is not None:
            caja_por_j.setdefault(m.jornada_id, []).append(m)
    banco_por_j: dict[int, list] = {}
    for m in banco_rows:
        if m.jornada_id is not None:
            banco_por_j.setdefault(m.jornada_id, []).append(m)

    rend_rows = (
        session.query(RendicionJornadaFinanciera)
        .filter(
            RendicionJornadaFinanciera.jornada_id.in_(ids),
            RendicionJornadaFinanciera.estado == "VIGENTE",
        )
        .all()
    )
    rend_por_j: dict[int, list] = {}
    for r in rend_rows:
        rend_por_j.setdefault(r.jornada_id, []).append(r)

    cortes_rows = (
        session.query(CorteJornadaFinanciera.jornada_id, func.count(CorteJornadaFinanciera.id))
        .filter(CorteJornadaFinanciera.jornada_id.in_(ids))
        .group_by(CorteJornadaFinanciera.jornada_id)
        .all()
    )
    cortes_counts = {int(jid): int(cnt) for jid, cnt in cortes_rows}

    fechas_unicas = list({j.fecha for j in jornadas})
    metricas_cache = _metricas_ventas_para_fechas(session, fechas_unicas)

    out: list[dict] = []
    for j in jornadas:
        mc = caja_por_j.get(j.id, [])
        mb = banco_por_j.get(j.id, [])
        movs_n = _normalizar_movimientos_caja(mc, tz) + _normalizar_movimientos_banco(mb, tz)
        movs_n.sort(key=lambda item: item.fecha, reverse=True)
        resumen = _totales_desde_movimientos_normalizados(movs_n)

        rv = rend_por_j.get(j.id, [])
        total_rendido = float(sum(item.monto_rendido or 0.0 for item in rv))

        ultima = max(rv, key=lambda r: (r.fecha_hora_rendicion or datetime.min, r.id)) if rv else None
        fecha_desde = ultima.fecha_hora_rendicion if ultima else None
        mov_p = list(movs_n)
        if fecha_desde:
            mov_p = [m for m in mov_p if m.fecha > fecha_desde]
        mov_p_contables = [m for m in mov_p if m.incluye_en_totales]
        ing_p = float(sum(mov.monto for mov in mov_p if mov.incluye_en_totales and mov.tipo in {"INGRESO", "AJUSTE (+)"}))
        eg_p = float(sum(mov.monto for mov in mov_p if mov.incluye_en_totales and mov.tipo in {"EGRESO", "GASTO", "AJUSTE (-)"}))
        pendiente_monto = ing_p - eg_p

        cuentas = metricas_cache.get(j.fecha) or {
            "total_pendiente": 0.0,
            "cantidad_ventas_con_saldo": 0,
            "total_ventas_con_saldo": 0.0,
            "total_cobrado_ventas_con_saldo": 0.0,
            "venta_total_dia": 0.0,
            "cantidad_ventas_dia": 0,
        }
        cant_cortes = int(cortes_counts.get(j.id, 0))

        out.append(
            {
                "jornada_id": j.id,
                "fecha": j.fecha,
                "estado": j.estado,
                "fecha_hora_apertura": j.fecha_hora_apertura,
                "usuario_apertura_nombre": j.usuario_apertura_nombre,
                "ingresos": resumen["ingresos"],
                "egresos": resumen["egresos"],
                "neto": resumen["neto"],
                "total_rendido": total_rendido,
                "pendiente_rendicion": float(pendiente_monto),
                "cantidad_movimientos_pendientes": len(mov_p_contables),
                "cantidad_cortes": cant_cortes,
                "cantidad_rendiciones": len(rv),
                "cuentas_por_cobrar_dia": float(cuentas["total_pendiente"]),
                "cantidad_ventas_cobrar_dia": int(cuentas["cantidad_ventas_con_saldo"]),
            }
        )
    return out


def construir_resumen_jornada_historica(session, jornada: JornadaFinanciera):
    return construir_filas_historial_jornadas(session, [jornada])[0]


def serializar_rendicion_historial(session, rendicion: RendicionJornadaFinanciera):
    data = serializar_rendicion(session, rendicion)
    jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == rendicion.jornada_id).first()
    data["jornada_fecha"] = jornada.fecha if jornada else hoy_jornada(session)
    return data


def obtener_movimientos_incluidos_en_rendicion(session, rendicion: RendicionJornadaFinanciera):
    jornada = session.query(JornadaFinanciera).filter(JornadaFinanciera.id == rendicion.jornada_id).first()
    if not jornada:
        return []

    rendicion_anterior = (
        session.query(RendicionJornadaFinanciera)
        .filter(
            RendicionJornadaFinanciera.jornada_id == rendicion.jornada_id,
            RendicionJornadaFinanciera.estado == "VIGENTE",
            RendicionJornadaFinanciera.fecha_hora_rendicion < rendicion.fecha_hora_rendicion,
        )
        .order_by(RendicionJornadaFinanciera.fecha_hora_rendicion.desc(), RendicionJornadaFinanciera.id.desc())
        .first()
    )
    fecha_desde = rendicion_anterior.fecha_hora_rendicion if rendicion_anterior else None
    movimientos = obtener_movimientos_normalizados_jornada(
        session,
        jornada,
        fecha_desde=fecha_desde,
        fecha_hasta=rendicion.fecha_hora_rendicion,
    )
    if fecha_desde:
        movimientos = [mov for mov in movimientos if mov.fecha > fecha_desde]
    movimientos = [mov for mov in movimientos if mov.fecha <= rendicion.fecha_hora_rendicion]
    return movimientos


def construir_resumen_rendicion(session, rendicion: RendicionJornadaFinanciera):
    movimientos = obtener_movimientos_incluidos_en_rendicion(session, rendicion)
    ingresos = [mov for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"INGRESO", "AJUSTE (+)"}]
    egresos = [mov for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"EGRESO", "GASTO", "AJUSTE (-)"}]
    total_ingresos = float(sum(mov.monto for mov in ingresos))
    total_egresos = float(sum(mov.monto for mov in egresos))
    resultado_neto = float(total_ingresos - total_egresos)
    margen = (resultado_neto / total_ingresos * 100) if total_ingresos > 0 else 0.0
    ingresos_caja = float(sum(mov.monto for mov in ingresos if mov.origen == "CAJA"))
    ingresos_banco = float(sum(mov.monto for mov in ingresos if mov.origen == "BANCO"))
    egresos_caja = float(sum(mov.monto for mov in egresos if mov.origen == "CAJA"))
    egresos_banco = float(sum(mov.monto for mov in egresos if mov.origen == "BANCO"))
    return SimpleNamespace(
        total_ingresos=total_ingresos,
        total_egresos=total_egresos,
        resultado_neto=resultado_neto,
        margen=margen,
        ingresos_caja=ingresos_caja,
        ingresos_banco=ingresos_banco,
        egresos_caja=egresos_caja,
        egresos_banco=egresos_banco,
        saldo_actual_caja=_saldo_actual_caja(session),
        saldo_actual_bancos=_saldo_actual_bancos(session),
        saldo_final_total=_saldo_actual_caja(session) + _saldo_actual_bancos(session),
        desglose_medios=construir_desglose_por_medio(movimientos),
        ingresos=ingresos,
        egresos=egresos,
        todos=movimientos,
    )


def construir_resumen_jornada_reporte(session, jornada: JornadaFinanciera | None):
    if not jornada:
        return SimpleNamespace(
            total_ingresos=0.0,
            total_egresos=0.0,
            resultado_neto=0.0,
            margen=0.0,
            ingresos_caja=0.0,
            ingresos_banco=0.0,
            egresos_caja=0.0,
            egresos_banco=0.0,
            saldo_actual_caja=0.0,
            saldo_actual_bancos=0.0,
            saldo_final_total=0.0,
            cuentas_por_cobrar_dia=0.0,
            cantidad_ventas_cobrar_dia=0,
            total_ventas_con_saldo=0.0,
            total_cobrado_ventas_con_saldo=0.0,
            venta_total_dia=0.0,
            cantidad_ventas_dia=0,
            desglose_medios=[],
            ingresos=[],
            egresos=[],
            todos=[],
        )

    movimientos = obtener_movimientos_normalizados_jornada(session, jornada)
    metricas_ventas = construir_metricas_ventas_dia(session, jornada)
    ingresos = [mov for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"INGRESO", "AJUSTE (+)"}]
    egresos = [mov for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"EGRESO", "GASTO", "AJUSTE (-)"}]
    total_ingresos = float(sum(mov.monto for mov in ingresos))
    total_egresos = float(sum(mov.monto for mov in egresos))
    resultado_neto = float(total_ingresos - total_egresos)
    margen = (resultado_neto / total_ingresos * 100) if total_ingresos > 0 else 0.0
    ingresos_caja = float(sum(mov.monto for mov in ingresos if mov.origen == "CAJA"))
    ingresos_banco = float(sum(mov.monto for mov in ingresos if mov.origen == "BANCO"))
    egresos_caja = float(sum(mov.monto for mov in egresos if mov.origen == "CAJA"))
    egresos_banco = float(sum(mov.monto for mov in egresos if mov.origen == "BANCO"))
    return SimpleNamespace(
        total_ingresos=total_ingresos,
        total_egresos=total_egresos,
        resultado_neto=resultado_neto,
        margen=margen,
        ingresos_caja=ingresos_caja,
        ingresos_banco=ingresos_banco,
        egresos_caja=egresos_caja,
        egresos_banco=egresos_banco,
        saldo_actual_caja=_saldo_actual_caja(session),
        saldo_actual_bancos=_saldo_actual_bancos(session),
        saldo_final_total=_saldo_actual_caja(session) + _saldo_actual_bancos(session),
        cuentas_por_cobrar_dia=float(metricas_ventas["total_pendiente"]),
        cantidad_ventas_cobrar_dia=int(metricas_ventas["cantidad_ventas_con_saldo"]),
        total_ventas_con_saldo=float(metricas_ventas["total_ventas_con_saldo"]),
        total_cobrado_ventas_con_saldo=float(metricas_ventas["total_cobrado_ventas_con_saldo"]),
        venta_total_dia=float(metricas_ventas["venta_total_dia"]),
        cantidad_ventas_dia=int(metricas_ventas["cantidad_ventas_dia"]),
        desglose_medios=construir_desglose_por_medio(movimientos),
        ingresos=ingresos,
        egresos=egresos,
        todos=movimientos,
    )


def construir_alerta_movimientos_posteriores(session):
    jornada_anterior = obtener_ultima_jornada_anterior(session)
    if not jornada_anterior:
        return None

    ultimo_corte = obtener_ultimo_corte_jornada(session, jornada_anterior.id)
    if not ultimo_corte:
        return None

    movimientos = obtener_movimientos_normalizados_jornada(
        session,
        jornada_anterior,
        fecha_desde=ultimo_corte.fecha_hora_corte,
    )
    movimientos = [mov for mov in movimientos if mov.fecha > ultimo_corte.fecha_hora_corte]
    if not movimientos:
        return None

    ingresos = float(sum(mov.monto for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"INGRESO", "AJUSTE (+)"}))
    egresos = float(sum(mov.monto for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"EGRESO", "GASTO", "AJUSTE (-)"}))
    return {
        "fecha_ultimo_corte": ultimo_corte.fecha_hora_corte,
        "usuario_ultimo_corte_nombre": ultimo_corte.usuario_nombre,
        "cantidad_movimientos": len(movimientos),
        "ingresos": ingresos,
        "egresos": egresos,
    }


def obtener_movimientos_posteriores_ultimo_corte(session):
    jornada_anterior = obtener_ultima_jornada_anterior(session)
    if not jornada_anterior:
        return None

    ultimo_corte = obtener_ultimo_corte_jornada(session, jornada_anterior.id)
    if not ultimo_corte:
        return None

    movimientos = obtener_movimientos_normalizados_jornada(
        session,
        jornada_anterior,
        fecha_desde=ultimo_corte.fecha_hora_corte,
    )
    movimientos = [mov for mov in movimientos if mov.fecha > ultimo_corte.fecha_hora_corte]
    if not movimientos:
        return None

    ingresos = float(sum(mov.monto for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"INGRESO", "AJUSTE (+)"}))
    egresos = float(sum(mov.monto for mov in movimientos if mov.incluye_en_totales and mov.tipo in {"EGRESO", "GASTO", "AJUSTE (-)"}))
    return {
        "fecha_ultimo_corte": ultimo_corte.fecha_hora_corte,
        "usuario_ultimo_corte_nombre": ultimo_corte.usuario_nombre,
        "cantidad_movimientos": len(movimientos),
        "ingresos": ingresos,
        "egresos": egresos,
        "movimientos": [
            {
                "fecha": mov.fecha,
                "origen": mov.origen,
                "categoria": mov.categoria,
                "concepto": mov.concepto,
                "monto": mov.monto,
                "tipo": mov.tipo,
                "referencia": mov.referencia,
                "banco_nombre": mov.banco_nombre,
                "ruta_origen": mov.ruta_origen,
            }
            for mov in movimientos
        ],
    }
