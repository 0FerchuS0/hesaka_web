from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime, date, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field

from app.database import get_session_for_tenant
from app.models.models import Banco, CanalVenta, Cliente, ConfiguracionCaja, ConfiguracionEmpresa, MovimientoBanco, MovimientoCaja, Pago, Vendedor, Venta, Compra
from app.utils.auth import get_current_user
from app.middleware.tenant import get_tenant_slug
from app.utils.excel_reporte_finanzas import generar_excel_reporte_finanzas
from app.utils.pdf_reporte_ventas import generar_pdf_reporte_ventas
from app.utils.excel_reporte_ventas import generar_excel_reporte_ventas
from app.utils.pdf_reporte_finanzas import generar_pdf_reporte_finanzas
from app.utils.pdf_reporte_compras import generar_pdf_reporte_compras
from app.utils.excel_reporte_compras import generar_excel_reporte_compras
from app.utils.pdf_estado_cuenta_cliente import generar_pdf_estado_cuenta_cliente
from app.utils.pdf_reporte_trabajos_lab import generar_pdf_reporte_trabajos_lab
from app.utils.configuracion_general import obtener_canal_principal

router = APIRouter(prefix="/api/reportes", tags=["Reportes"])

# --- Esquemas de Respuesta ---
class ReporteVentaOut(BaseModel):
    venta_id: int
    fecha: datetime
    codigo: str
    cliente_nombre: str
    vendedor_nombre: Optional[str] = None
    canal_venta_nombre: Optional[str] = None
    estado: str
    total_venta: float
    costo_total: float
    utilidad_bruta: float
    margen_bruto: float
    total_comisiones_referidor: float
    total_comisiones_bancarias: float

class ResumenReporteVentasOut(BaseModel):
    ventas: List[ReporteVentaOut]
    total_ventas: float
    total_costos: float
    utilidad_bruta_total: float
    total_comisiones: float
    utilidad_neta: float
    margen_promedio: float
    cantidad_ventas: int
    por_vendedor: List["ResumenGrupoVentasOut"] = Field(default_factory=list)
    por_canal: List["ResumenGrupoVentasOut"] = Field(default_factory=list)


class ResumenGrupoVentasOut(BaseModel):
    clave: str
    etiqueta: str
    cantidad_ventas: int
    total_ventas: float
    total_costos: float
    utilidad_neta: float
    margen_promedio: float


class ReporteCompraOut(BaseModel):
    compra_id: int
    fecha: datetime
    proveedor_nombre: str
    ventas_codigos: str
    clientes: str
    tipo_documento: str
    nro_factura: str
    nro_os: str
    condicion_pago: str
    tipo_compra: str
    estado: str
    estado_entrega: str
    total: float
    total_pagado: float
    saldo: float


class ResumenProveedorCompraOut(BaseModel):
    proveedor_id: Optional[int] = None
    proveedor_nombre: str
    cantidad_compras: int
    total_comprado: float
    total_pagado: float
    saldo_pendiente: float


class ResumenReporteComprasOut(BaseModel):
    compras: List[ReporteCompraOut]
    por_proveedor: List[ResumenProveedorCompraOut]
    total_comprado: float
    total_pagado: float
    total_pendiente: float
    total_credito: float
    total_contado: float
    total_os: float
    cantidad_compras: int


class MovimientoFinancieroOut(BaseModel):
    fecha: datetime
    origen: str
    categoria: str
    concepto: str
    monto: float
    tipo: str
    referencia: str
    banco_id: Optional[int] = None
    banco_nombre: Optional[str] = None


class ResumenReporteFinancieroOut(BaseModel):
    total_ingresos: float
    total_egresos: float
    resultado_neto: float
    margen: float
    ingresos_caja: float = 0.0
    ingresos_banco: float = 0.0
    egresos_caja: float = 0.0
    egresos_banco: float = 0.0
    saldo_actual_caja: float = 0.0
    saldo_actual_bancos: float = 0.0
    saldo_final_total: float = 0.0
    ingresos: List[MovimientoFinancieroOut]
    egresos: List[MovimientoFinancieroOut]
    todos: List[MovimientoFinancieroOut]


class PeriodoComparativoVentasOut(BaseModel):
    etiqueta: str
    fecha_desde: datetime
    fecha_hasta: datetime
    total_ventas: float


class ComparativaVentasDashboardOut(BaseModel):
    actual: PeriodoComparativoVentasOut
    mes_anterior: PeriodoComparativoVentasOut
    ano_anterior: PeriodoComparativoVentasOut


class ComparativoMensualFilaOut(BaseModel):
    anio: int
    mes_numero: int
    mes: str
    fecha_desde: datetime
    fecha_hasta: datetime
    cantidad_ventas: int
    total_ventas: float
    total_costos: float
    utilidad_bruta: float
    total_comisiones: float
    utilidad_neta: float
    ticket_promedio: float
    variacion_vs_mes_anterior: Optional[float] = None
    variacion_vs_mismo_mes_ano_anterior: Optional[float] = None


class ComparativoMensualResumenOut(BaseModel):
    anio: int
    filas: List[ComparativoMensualFilaOut]
    total_ventas: float
    total_costos: float
    utilidad_bruta_total: float
    total_comisiones: float
    utilidad_neta_total: float
    promedio_mensual: float
    mejor_mes: Optional[str] = None
    peor_mes: Optional[str] = None


class ReporteComparativoMensualFilaOut(BaseModel):
    mes_anio: str
    periodo_texto: str
    total_ventas: float
    total_costos: float
    utilidad_bruta: float
    total_comisiones: float
    utilidad_neta: float
    margen_bruto_promedio: float
    cantidad_ventas: int
    year: int
    month: int


class ReporteComparativoMensualOut(BaseModel):
    modo: str
    fecha_referencia: datetime
    filas: List[ReporteComparativoMensualFilaOut]


class DashboardSerieVentasOut(BaseModel):
    mes: str
    ventas: float


class DashboardVentaRecienteOut(BaseModel):
    id: int
    codigo: str
    cliente_nombre: str
    total: float
    estado: str


class DashboardCompraPendienteOut(BaseModel):
    id: int
    fecha: datetime
    proveedor_nombre: str
    tipo_documento: str
    total: float
    saldo: float
    estado_entrega: str


class DashboardResumenOut(BaseModel):
    saldo_caja: float
    ventas_pendientes_count: int
    compras_pendientes_count: int
    ventas_recientes: List[DashboardVentaRecienteOut]
    compras_pendientes: List[DashboardCompraPendienteOut]
    serie_ventas: List[DashboardSerieVentasOut]
    comparativa_ventas: ComparativaVentasDashboardOut


class SaldoClienteOut(BaseModel):
    cliente_id: int
    cliente_nombre: str
    cliente_ci: Optional[str] = None
    cliente_telefono: Optional[str] = None
    cantidad_creditos: int
    total_credito: float
    total_pagado: float
    saldo_pendiente: float


class MovimientoEstadoCuentaOut(BaseModel):
    fecha: datetime
    tipo: str
    descripcion: str
    debito: float
    credito: float
    saldo_acumulado: float


class VentaPendienteClienteOut(BaseModel):
    venta_id: int
    fecha: datetime
    codigo: str
    total: float
    pagado: float
    saldo: float
    estado: str


class DetalleSaldoClienteOut(BaseModel):
    cliente_id: int
    cliente_nombre: str
    cliente_ci: Optional[str] = None
    cliente_telefono: Optional[str] = None
    total_deuda: float
    ventas_pendientes: List[VentaPendienteClienteOut]
    movimientos: List[MovimientoEstadoCuentaOut]


class ResumenSaldosClientesOut(BaseModel):
    clientes: List[SaldoClienteOut]
    total_deuda: float
    cantidad_clientes: int
    cantidad_creditos: int


class TrabajoLaboratorioOut(BaseModel):
    venta_id: int
    fecha: datetime
    codigo: str
    cliente_id: Optional[int] = None
    cliente_nombre: str
    detalle_trabajo: str
    saldo_pendiente: float


class ResumenTrabajosLaboratorioOut(BaseModel):
    trabajos: List[TrabajoLaboratorioOut]
    total_trabajos: int
    total_saldo_pendiente: float


def _clasificar_movimiento(origen: str, movimiento) -> str:
    if getattr(movimiento, "grupo_pago_id", None) and str(getattr(movimiento, "grupo_pago_id")).startswith("TRF-"):
        return "TRANSFERENCIA_INTERNA"
    if getattr(movimiento, "pago_venta_id", None):
        return "COBRO_VENTA"
    if getattr(movimiento, "pago_compra_id", None):
        return "PAGO_COMPRA"
    if getattr(movimiento, "gasto_operativo_id", None):
        return "GASTO_OPERATIVO"
    if getattr(movimiento, "deposito_banco_id", None):
        return "TRANSFERENCIA_INTERNA"
    if movimiento.tipo == "AJUSTE":
        return "AJUSTE"
    return f"MOVIMIENTO_{origen}"


def _sumar_ventas_periodo(session: Session, fecha_desde: datetime, fecha_hasta: datetime) -> float:
    total = (
        session.query(Venta)
        .filter(
            Venta.fecha >= fecha_desde,
            Venta.fecha <= fecha_hasta,
            Venta.estado.notin_(['ANULADO', 'ANULADA'])
        )
        .with_entities(Venta.total)
        .all()
    )
    return float(sum((row[0] or 0.0) for row in total))


def _detalle_trabajo_laboratorio(venta: Venta) -> str:
    presupuesto = venta.presupuesto_rel
    if not presupuesto:
        return "Sin detalles"

    detalles = []
    tiene_graduacion = bool(
        presupuesto.graduacion_od_esfera
        or presupuesto.graduacion_od_cilindro
        or presupuesto.graduacion_od_eje
        or presupuesto.graduacion_oi_esfera
        or presupuesto.graduacion_oi_cilindro
        or presupuesto.graduacion_oi_eje
    )
    if tiene_graduacion:
        detalles.append("GRADUADO")

    productos = []
    for item in presupuesto.items or []:
        nombre = None
        if item.descripcion_personalizada:
            nombre = item.descripcion_personalizada
        elif item.producto_rel and item.producto_rel.nombre:
            nombre = item.producto_rel.nombre
        if nombre:
            productos.append(nombre.strip())

    if productos:
        detalles.append(", ".join(productos))

    return " - ".join(detalles) if detalles else "Sin detalles"


def _obtener_comparativa_dashboard(session: Session) -> ComparativaVentasDashboardOut:
    ahora = datetime.now()

    inicio_actual = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    fin_actual = ahora

    primer_dia_actual = ahora.replace(day=1)
    ultimo_dia_mes_anterior = primer_dia_actual - timedelta(days=1)
    inicio_mes_anterior = ultimo_dia_mes_anterior.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    try:
        fin_mes_anterior = inicio_mes_anterior.replace(
            day=ahora.day,
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )
    except ValueError:
        fin_mes_anterior = ultimo_dia_mes_anterior.replace(
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )

    try:
        inicio_ano_anterior = inicio_actual.replace(year=ahora.year - 1)
    except ValueError:
        inicio_ano_anterior = inicio_actual

    try:
        fin_ano_anterior = fin_actual.replace(
            year=ahora.year - 1,
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )
    except ValueError:
        fin_ano_anterior = fin_actual.replace(
            year=ahora.year - 1,
            day=28,
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )

    return ComparativaVentasDashboardOut(
        actual=PeriodoComparativoVentasOut(
            etiqueta="Ventas Este Periodo",
            fecha_desde=inicio_actual,
            fecha_hasta=fin_actual,
            total_ventas=_sumar_ventas_periodo(session, inicio_actual, fin_actual),
        ),
        mes_anterior=PeriodoComparativoVentasOut(
            etiqueta="Vs Mes Anterior (Mismo Periodo)",
            fecha_desde=inicio_mes_anterior,
            fecha_hasta=fin_mes_anterior,
            total_ventas=_sumar_ventas_periodo(session, inicio_mes_anterior, fin_mes_anterior),
        ),
        ano_anterior=PeriodoComparativoVentasOut(
            etiqueta="Vs Ano Anterior (Mismo Periodo)",
            fecha_desde=inicio_ano_anterior,
            fecha_hasta=fin_ano_anterior,
            total_ventas=_sumar_ventas_periodo(session, inicio_ano_anterior, fin_ano_anterior),
        ),
    )


def _obtener_metricas_ventas_periodo(session: Session, fecha_desde: datetime, fecha_hasta: datetime):
    ventas_db = (
        session.query(Venta)
        .filter(
            Venta.fecha >= fecha_desde,
            Venta.fecha <= fecha_hasta,
            Venta.estado.notin_(['ANULADO', 'ANULADA'])
        )
        .order_by(Venta.fecha.desc())
        .all()
    )

    total_ventas = 0.0
    total_costos = 0.0
    total_comisiones_referidor = 0.0
    total_comisiones_bancarias = 0.0

    for venta in ventas_db:
        total_ventas += float(venta.total or 0.0)

        presupuesto = venta.presupuesto_rel
        if presupuesto and presupuesto.items:
            for item in presupuesto.items:
                costo_unitario = float(getattr(item, 'costo_unitario', 0.0) or 0.0)
                cantidad = int(getattr(item, 'cantidad', 0) or 0)
                total_costos += costo_unitario * cantidad

        total_comisiones_referidor += float(getattr(venta, 'comision_monto', 0.0) or 0.0)

        for pago in getattr(venta, 'pagos', []) or []:
            if pago.metodo_pago == 'TARJETA':
                porcentaje_comision = 3.3
                banco = getattr(pago, 'banco_rel', None)
                if banco and getattr(banco, 'porcentaje_comision', None):
                    porcentaje_comision = banco.porcentaje_comision
                total_comisiones_bancarias += float(pago.monto or 0.0) * (float(porcentaje_comision) / 100.0)

    utilidad_bruta = total_ventas - total_costos
    total_comisiones = total_comisiones_referidor + total_comisiones_bancarias
    utilidad_neta = utilidad_bruta - total_comisiones
    cantidad_ventas = len(ventas_db)
    ticket_promedio = (total_ventas / cantidad_ventas) if cantidad_ventas > 0 else 0.0

    return {
        'cantidad_ventas': cantidad_ventas,
        'total_ventas': float(total_ventas),
        'total_costos': float(total_costos),
        'utilidad_bruta': float(utilidad_bruta),
        'total_comisiones': float(total_comisiones),
        'utilidad_neta': float(utilidad_neta),
        'ticket_promedio': float(ticket_promedio),
    }


def _porcentaje_variacion(actual: float, base: float) -> Optional[float]:
    if base in (None, 0):
        return None
    return float(((actual - base) / base) * 100.0)


def _obtener_comparativo_mensual(session: Session, anio: int) -> ComparativoMensualResumenOut:
    nombres_meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    filas: List[ComparativoMensualFilaOut] = []

    for mes_numero in range(1, 13):
        fecha_desde = datetime(anio, mes_numero, 1, 0, 0, 0)
        if mes_numero == 12:
            fecha_hasta = datetime(anio + 1, 1, 1, 0, 0, 0) - timedelta(microseconds=1)
        else:
            fecha_hasta = datetime(anio, mes_numero + 1, 1, 0, 0, 0) - timedelta(microseconds=1)

        metricas = _obtener_metricas_ventas_periodo(session, fecha_desde, fecha_hasta)

        if mes_numero == 1:
            prev_desde = datetime(anio - 1, 12, 1, 0, 0, 0)
            prev_hasta = datetime(anio, 1, 1, 0, 0, 0) - timedelta(microseconds=1)
        else:
            prev_desde = datetime(anio, mes_numero - 1, 1, 0, 0, 0)
            prev_hasta = datetime(anio, mes_numero, 1, 0, 0, 0) - timedelta(microseconds=1)

        anterior_metricas = _obtener_metricas_ventas_periodo(session, prev_desde, prev_hasta)

        mismo_mes_ano_anterior_desde = datetime(anio - 1, mes_numero, 1, 0, 0, 0)
        if mes_numero == 12:
            mismo_mes_ano_anterior_hasta = datetime(anio, 1, 1, 0, 0, 0) - timedelta(microseconds=1)
        else:
            mismo_mes_ano_anterior_hasta = datetime(anio - 1, mes_numero + 1, 1, 0, 0, 0) - timedelta(microseconds=1)

        ano_anterior_metricas = _obtener_metricas_ventas_periodo(session, mismo_mes_ano_anterior_desde, mismo_mes_ano_anterior_hasta)

        filas.append(
            ComparativoMensualFilaOut(
                anio=anio,
                mes_numero=mes_numero,
                mes=nombres_meses[mes_numero - 1],
                fecha_desde=fecha_desde,
                fecha_hasta=fecha_hasta,
                cantidad_ventas=metricas['cantidad_ventas'],
                total_ventas=metricas['total_ventas'],
                total_costos=metricas['total_costos'],
                utilidad_bruta=metricas['utilidad_bruta'],
                total_comisiones=metricas['total_comisiones'],
                utilidad_neta=metricas['utilidad_neta'],
                ticket_promedio=metricas['ticket_promedio'],
                variacion_vs_mes_anterior=_porcentaje_variacion(metricas['total_ventas'], anterior_metricas['total_ventas']),
                variacion_vs_mismo_mes_ano_anterior=_porcentaje_variacion(metricas['total_ventas'], ano_anterior_metricas['total_ventas']),
            )
        )

    total_ventas = sum(f.total_ventas for f in filas)
    total_costos = sum(f.total_costos for f in filas)
    utilidad_bruta_total = sum(f.utilidad_bruta for f in filas)
    total_comisiones = sum(f.total_comisiones for f in filas)
    utilidad_neta_total = sum(f.utilidad_neta for f in filas)
    promedio_mensual = total_ventas / 12 if filas else 0.0

    mejor_mes = max(filas, key=lambda f: f.total_ventas).mes if filas else None
    peor_mes = min(filas, key=lambda f: f.total_ventas).mes if filas else None

    return ComparativoMensualResumenOut(
        anio=anio,
        filas=filas,
        total_ventas=float(total_ventas),
        total_costos=float(total_costos),
        utilidad_bruta_total=float(utilidad_bruta_total),
        total_comisiones=float(total_comisiones),
        utilidad_neta_total=float(utilidad_neta_total),
        promedio_mensual=float(promedio_mensual),
        mejor_mes=mejor_mes,
        peor_mes=peor_mes,
    )


def _get_date_range_comparativo(fecha_referencia: datetime, months_back: int, modo: str):
    target_year = fecha_referencia.year
    target_month = fecha_referencia.month - months_back

    while target_month <= 0:
        target_month += 12
        target_year -= 1

    start_date = fecha_referencia.replace(
        year=target_year,
        month=target_month,
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    _, last_day_of_month = __import__('calendar').monthrange(target_year, target_month)

    if modo == 'DIA':
        target_day = fecha_referencia.day
        actual_day = min(target_day, last_day_of_month)
        end_date = fecha_referencia.replace(
            year=target_year,
            month=target_month,
            day=actual_day,
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )
        period_text = f"1 al {actual_day}"
    else:
        end_date = fecha_referencia.replace(
            year=target_year,
            month=target_month,
            day=last_day_of_month,
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )
        period_text = "Mes Completo"

    return start_date, end_date, period_text


def _obtener_reporte_comparativo_mensual(session: Session, fecha_referencia: datetime, modo: str) -> ReporteComparativoMensualOut:
    filas: List[ReporteComparativoMensualFilaOut] = []

    for i in range(13):
        start_date, end_date, period_text = _get_date_range_comparativo(fecha_referencia, i, modo)
        metricas = _obtener_metricas_ventas_periodo(session, start_date, end_date)

        filas.append(
            ReporteComparativoMensualFilaOut(
                mes_anio=start_date.strftime("%B %Y").capitalize(),
                periodo_texto=period_text,
                total_ventas=metricas['total_ventas'],
                total_costos=metricas['total_costos'],
                utilidad_bruta=metricas['utilidad_bruta'],
                total_comisiones=metricas['total_comisiones'],
                utilidad_neta=metricas['utilidad_neta'],
                margen_bruto_promedio=(metricas['utilidad_bruta'] / metricas['total_ventas'] * 100.0) if metricas['total_ventas'] > 0 else 0.0,
                cantidad_ventas=metricas['cantidad_ventas'],
                year=start_date.year,
                month=start_date.month,
            )
        )

    return ReporteComparativoMensualOut(
        modo=modo,
        fecha_referencia=fecha_referencia,
        filas=filas,
    )


def _iterar_ultimos_meses(fecha_referencia: datetime, cantidad: int = 7):
    meses = []
    year = fecha_referencia.year
    month = fecha_referencia.month
    for _ in range(cantidad):
        meses.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return list(reversed(meses))


def _obtener_resumen_dashboard(session: Session) -> DashboardResumenOut:
    caja = session.query(ConfiguracionCaja).first()
    saldo_caja = caja.saldo_actual if caja else 0.0

    ventas_pendientes_count = (
        session.query(Venta)
        .filter(Venta.estado == 'PENDIENTE')
        .count()
    )

    compras_pendientes_db = (
        session.query(Compra)
        .filter(Compra.estado == 'PENDIENTE')
        .order_by(Compra.fecha.desc())
        .limit(5)
        .all()
    )

    ventas_recientes_db = (
        session.query(Venta)
        .filter(Venta.estado.notin_(['ANULADO', 'ANULADA']))
        .order_by(Venta.fecha.desc())
        .limit(5)
        .all()
    )

    ahora = datetime.now()
    serie_ventas = []
    nombres_meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    for year, month in _iterar_ultimos_meses(ahora, 7):
        inicio = datetime(year, month, 1, 0, 0, 0)
        if month == 12:
            fin = datetime(year + 1, 1, 1, 0, 0, 0) - timedelta(microseconds=1)
        else:
            fin = datetime(year, month + 1, 1, 0, 0, 0) - timedelta(microseconds=1)

        total_mes = (
            session.query(func.sum(Venta.total))
            .filter(
                Venta.fecha >= inicio,
                Venta.fecha <= fin,
                Venta.estado.notin_(['ANULADO', 'ANULADA'])
            )
            .scalar()
            or 0.0
        )
        serie_ventas.append(
            DashboardSerieVentasOut(
                mes=nombres_meses[month - 1],
                ventas=float(total_mes),
            )
        )

    return DashboardResumenOut(
        saldo_caja=float(saldo_caja or 0.0),
        ventas_pendientes_count=ventas_pendientes_count,
        compras_pendientes_count=len(compras_pendientes_db),
        ventas_recientes=[
            DashboardVentaRecienteOut(
                id=venta.id,
                codigo=venta.codigo,
                cliente_nombre=venta.cliente_rel.nombre if venta.cliente_rel else '—',
                total=float(venta.total or 0.0),
                estado=venta.estado,
            )
            for venta in ventas_recientes_db
        ],
        compras_pendientes=[
            DashboardCompraPendienteOut(
                id=compra.id,
                fecha=compra.fecha,
                proveedor_nombre=compra.proveedor_rel.nombre if compra.proveedor_rel else '—',
                tipo_documento=compra.tipo_documento or '',
                total=float(compra.total or 0.0),
                saldo=float(compra.saldo or 0.0),
                estado_entrega=compra.estado_entrega or '',
            )
            for compra in compras_pendientes_db
        ],
        serie_ventas=serie_ventas,
        comparativa_ventas=_obtener_comparativa_dashboard(session),
    )

def _obtener_datos_reporte_ventas(
    session: Session,
    fecha_desde: Optional[date],
    fecha_hasta: Optional[date],
    cliente_id: Optional[int],
    estado_pago: Optional[str],
    vendedor_id: Optional[int] = None,
    canal_venta_id: Optional[int] = None,
):
    query = session.query(Venta).filter(Venta.estado.notin_(['ANULADO', 'ANULADA']))
        
    if fecha_desde:
        query = query.filter(Venta.fecha >= datetime.combine(fecha_desde, datetime.min.time()))
        
    if fecha_hasta:
        query = query.filter(Venta.fecha <= datetime.combine(fecha_hasta, datetime.max.time()))
        
    if cliente_id:
        query = query.filter(Venta.cliente_id == cliente_id)

    if vendedor_id:
        query = query.filter(Venta.vendedor_id == vendedor_id)

    if canal_venta_id:
        query = query.filter(Venta.canal_venta_id == canal_venta_id)
        
    if estado_pago:
        query = query.filter(Venta.estado == estado_pago)
        
    ventas_db = query.order_by(Venta.fecha.desc()).all()
    
    resultado_ventas = []
    ventas_data = [] # For PDF/Excel format
    suma_ventas = 0.0
    suma_costos = 0.0
    suma_utilidad_bruta = 0.0
    suma_comisiones_referidor = 0.0
    suma_comisiones_bancarias = 0.0
    resumen_vendedores = {}
    resumen_canales = {}
    canal_default = obtener_canal_principal(session)
    
    for venta in ventas_db:
        presupuesto = venta.presupuesto_rel
        
        # Calcular costo
        costo_total = 0.0
        if presupuesto and presupuesto.items:
            for item in presupuesto.items:
                costo = item.costo_unitario if hasattr(item, 'costo_unitario') and item.costo_unitario else 0.0
                costo_total += costo * item.cantidad
                
        utilidad_bruta = venta.total - costo_total
        margen_bruto = (utilidad_bruta / venta.total * 100) if venta.total > 0 else 0.0
        
        # Comisiones referidor
        com_ref = venta.comision_monto if venta.comision_monto else 0.0
        
        # Comisiones bancarias
        com_ban = 0.0
        if venta.pagos:
            for pago in venta.pagos:
                if pago.metodo_pago == 'TARJETA':
                    # Default 3.3% o lo que dicte el banco
                    porcentaje_comision = 3.3
                    banco = pago.banco_rel
                    if banco and hasattr(banco, 'porcentaje_comision') and banco.porcentaje_comision:
                        porcentaje_comision = banco.porcentaje_comision
                    com_ban += pago.monto * (porcentaje_comision / 100.0)
        
        # Sumar a totales
        suma_ventas += venta.total
        suma_costos += costo_total
        suma_utilidad_bruta += utilidad_bruta
        suma_comisiones_referidor += com_ref
        suma_comisiones_bancarias += com_ban
        
        cliente_text = venta.cliente_rel.nombre if venta.cliente_rel else "Sin cliente"
        
        resultado_ventas.append(ReporteVentaOut(
            venta_id=venta.id,
            fecha=venta.fecha,
            codigo=venta.codigo,
            cliente_nombre=cliente_text,
            vendedor_nombre=venta.vendedor_rel.nombre if getattr(venta, 'vendedor_rel', None) else None,
            canal_venta_nombre=venta.canal_venta_rel.nombre if getattr(venta, 'canal_venta_rel', None) else None,
            estado=venta.estado,
            total_venta=venta.total,
            costo_total=costo_total,
            utilidad_bruta=utilidad_bruta,
            margen_bruto=margen_bruto,
            total_comisiones_referidor=com_ref,
            total_comisiones_bancarias=com_ban
        ))
        
        ventas_data.append({
            'venta': venta,
            'costo_total': costo_total,
            'utilidad_bruta': utilidad_bruta,
            'margen_bruto': margen_bruto
        })

        utilidad_neta_venta = utilidad_bruta - (com_ref + com_ban)
        etiqueta_vendedor = venta.vendedor_rel.nombre if getattr(venta, 'vendedor_rel', None) else 'Sin vendedor'
        clave_vendedor = f"vendedor:{venta.vendedor_id or 0}"
        bucket_vendedor = resumen_vendedores.setdefault(
            clave_vendedor,
            {"clave": clave_vendedor, "etiqueta": etiqueta_vendedor, "cantidad_ventas": 0, "total_ventas": 0.0, "total_costos": 0.0, "utilidad_neta": 0.0},
        )
        bucket_vendedor["cantidad_ventas"] += 1
        bucket_vendedor["total_ventas"] += float(venta.total or 0.0)
        bucket_vendedor["total_costos"] += float(costo_total or 0.0)
        bucket_vendedor["utilidad_neta"] += float(utilidad_neta_venta or 0.0)

        etiqueta_canal = venta.canal_venta_rel.nombre if getattr(venta, 'canal_venta_rel', None) else (canal_default.nombre if canal_default else 'Canal principal')
        clave_canal = f"canal:{venta.canal_venta_id or 0}"
        bucket_canal = resumen_canales.setdefault(
            clave_canal,
            {"clave": clave_canal, "etiqueta": etiqueta_canal, "cantidad_ventas": 0, "total_ventas": 0.0, "total_costos": 0.0, "utilidad_neta": 0.0},
        )
        bucket_canal["cantidad_ventas"] += 1
        bucket_canal["total_ventas"] += float(venta.total or 0.0)
        bucket_canal["total_costos"] += float(costo_total or 0.0)
        bucket_canal["utilidad_neta"] += float(utilidad_neta_venta or 0.0)
        
    total_comisiones = suma_comisiones_referidor + suma_comisiones_bancarias
    utilidad_neta = suma_utilidad_bruta - total_comisiones
    margen_prom_global = (suma_utilidad_bruta / suma_ventas * 100) if suma_ventas > 0 else 0.0
    por_vendedor = [
        ResumenGrupoVentasOut(
            clave=item["clave"],
            etiqueta=item["etiqueta"],
            cantidad_ventas=item["cantidad_ventas"],
            total_ventas=item["total_ventas"],
            total_costos=item["total_costos"],
            utilidad_neta=item["utilidad_neta"],
            margen_promedio=(item["utilidad_neta"] / item["total_ventas"] * 100) if item["total_ventas"] else 0.0,
        )
        for item in sorted(resumen_vendedores.values(), key=lambda x: (-x["total_ventas"], x["etiqueta"]))
    ]
    por_canal = [
        ResumenGrupoVentasOut(
            clave=item["clave"],
            etiqueta=item["etiqueta"],
            cantidad_ventas=item["cantidad_ventas"],
            total_ventas=item["total_ventas"],
            total_costos=item["total_costos"],
            utilidad_neta=item["utilidad_neta"],
            margen_promedio=(item["utilidad_neta"] / item["total_ventas"] * 100) if item["total_ventas"] else 0.0,
        )
        for item in sorted(resumen_canales.values(), key=lambda x: (-x["total_ventas"], x["etiqueta"]))
    ]
    
    resumen_json = ResumenReporteVentasOut(
        ventas=resultado_ventas,
        total_ventas=suma_ventas,
        total_costos=suma_costos,
        utilidad_bruta_total=suma_utilidad_bruta,
        total_comisiones=total_comisiones,
        utilidad_neta=utilidad_neta,
        margen_promedio=margen_prom_global,
        cantidad_ventas=len(resultado_ventas),
        por_vendedor=por_vendedor,
        por_canal=por_canal,
    )
    
    return resumen_json, ventas_data, suma_comisiones_referidor, suma_comisiones_bancarias


def _obtener_datos_reporte_compras(
    session: Session,
    fecha_desde: Optional[date],
    fecha_hasta: Optional[date],
    proveedor_id: Optional[int],
    estado: Optional[str],
    tipo_documento: Optional[str],
    condicion_pago: Optional[str],
):
    query = session.query(Compra)

    if fecha_desde:
        query = query.filter(Compra.fecha >= datetime.combine(fecha_desde, datetime.min.time()))
    if fecha_hasta:
        query = query.filter(Compra.fecha <= datetime.combine(fecha_hasta, datetime.max.time()))
    if proveedor_id:
        query = query.filter(Compra.proveedor_id == proveedor_id)
    if estado:
        query = query.filter(Compra.estado == estado)
    else:
        query = query.filter(Compra.estado != 'ANULADO')
    if tipo_documento:
        query = query.filter(Compra.tipo_documento == tipo_documento)
    if condicion_pago:
        query = query.filter(Compra.condicion_pago == condicion_pago)

    compras_db = query.order_by(Compra.fecha.desc(), Compra.id.desc()).all()

    compras_out = []
    compras_data = []
    total_comprado = 0.0
    total_pagado = 0.0
    total_pendiente = 0.0
    total_credito = 0.0
    total_contado = 0.0
    total_os = 0.0
    resumen_proveedores = {}

    for compra in compras_db:
        proveedor_nombre = compra.proveedor_rel.nombre if compra.proveedor_rel else 'Sin proveedor'

        ventas_codigos = []
        clientes = []
        if compra.ventas_asociadas:
            for relacion in compra.ventas_asociadas:
                if relacion.venta_rel:
                    if relacion.venta_rel.codigo and relacion.venta_rel.codigo not in ventas_codigos:
                        ventas_codigos.append(relacion.venta_rel.codigo)
                    if relacion.venta_rel.cliente_rel and relacion.venta_rel.cliente_rel.nombre and relacion.venta_rel.cliente_rel.nombre not in clientes:
                        clientes.append(relacion.venta_rel.cliente_rel.nombre)
        if compra.venta_rel:
            if compra.venta_rel.codigo and compra.venta_rel.codigo not in ventas_codigos:
                ventas_codigos.append(compra.venta_rel.codigo)
            if compra.venta_rel.cliente_rel and compra.venta_rel.cliente_rel.nombre and compra.venta_rel.cliente_rel.nombre not in clientes:
                clientes.append(compra.venta_rel.cliente_rel.nombre)
        if compra.cliente_rel and compra.cliente_rel.nombre and compra.cliente_rel.nombre not in clientes:
            clientes.append(compra.cliente_rel.nombre)

        nro_os = ''
        if (
            (compra.tipo_documento_original or '').upper() == 'ORDEN_SERVICIO'
            or (compra.tipo_documento or '').upper() == 'ORDEN_SERVICIO'
            or (compra.nro_documento_original and compra.nro_documento_original != compra.nro_factura)
        ):
            nro_os = compra.nro_documento_original or compra.nro_factura or ''

        pagado = max((compra.total or 0.0) - (compra.saldo or 0.0), 0.0)

        registro = ReporteCompraOut(
            compra_id=compra.id,
            fecha=compra.fecha,
            proveedor_nombre=proveedor_nombre,
            ventas_codigos=', '.join(ventas_codigos),
            clientes=', '.join(clientes),
            tipo_documento=compra.tipo_documento or '',
            nro_factura=compra.nro_factura or '',
            nro_os=nro_os,
            condicion_pago=compra.condicion_pago or '',
            tipo_compra=compra.tipo_compra or '',
            estado=compra.estado or '',
            estado_entrega=compra.estado_entrega or '',
            total=compra.total or 0.0,
            total_pagado=pagado,
            saldo=compra.saldo or 0.0,
        )
        compras_out.append(registro)
        compras_data.append(registro.model_dump())

        total_comprado += registro.total
        total_pagado += registro.total_pagado
        total_pendiente += registro.saldo
        if registro.condicion_pago == 'CREDITO':
            total_credito += registro.total
        if registro.condicion_pago == 'CONTADO':
            total_contado += registro.total
        if registro.nro_os:
            total_os += registro.total

        provider_key = compra.proveedor_id or 0
        if provider_key not in resumen_proveedores:
            resumen_proveedores[provider_key] = {
                'proveedor_id': compra.proveedor_id,
                'proveedor_nombre': proveedor_nombre,
                'cantidad_compras': 0,
                'total_comprado': 0.0,
                'total_pagado': 0.0,
                'saldo_pendiente': 0.0,
            }
        resumen_proveedores[provider_key]['cantidad_compras'] += 1
        resumen_proveedores[provider_key]['total_comprado'] += registro.total
        resumen_proveedores[provider_key]['total_pagado'] += registro.total_pagado
        resumen_proveedores[provider_key]['saldo_pendiente'] += registro.saldo

    por_proveedor = [
        ResumenProveedorCompraOut(**data)
        for data in sorted(resumen_proveedores.values(), key=lambda item: item['proveedor_nombre'])
    ]

    resumen = ResumenReporteComprasOut(
        compras=compras_out,
        por_proveedor=por_proveedor,
        total_comprado=total_comprado,
        total_pagado=total_pagado,
        total_pendiente=total_pendiente,
        total_credito=total_credito,
        total_contado=total_contado,
        total_os=total_os,
        cantidad_compras=len(compras_out),
    )
    return resumen, compras_data


def _obtener_datos_reporte_financiero(
    session: Session,
    fecha_desde: date,
    fecha_hasta: date,
    origen: Optional[str] = None,
    banco_id: Optional[int] = None,
):
    fecha_inicio = datetime.combine(fecha_desde, datetime.min.time())
    fecha_fin = datetime.combine(fecha_hasta, datetime.max.time())

    movs_caja_query = session.query(MovimientoCaja).filter(
        MovimientoCaja.fecha >= fecha_inicio,
        MovimientoCaja.fecha <= fecha_fin,
    )
    if origen == "CAJA":
        movs_banco = []
    else:
        movs_banco_query = session.query(MovimientoBanco).filter(
            MovimientoBanco.fecha >= fecha_inicio,
            MovimientoBanco.fecha <= fecha_fin,
        )
        if banco_id:
            movs_banco_query = movs_banco_query.filter(MovimientoBanco.banco_id == banco_id)
        movs_banco = movs_banco_query.all()

    if origen == "BANCO":
        movs_caja = []
    else:
        movs_caja = movs_caja_query.all()

    ingresos = []
    egresos = []
    total_ingresos = 0.0
    total_egresos = 0.0
    ingresos_caja = 0.0
    ingresos_banco = 0.0
    egresos_caja = 0.0
    egresos_banco = 0.0

    for movimiento in movs_caja:
        categoria = _clasificar_movimiento("CAJA", movimiento)
        if categoria == "TRANSFERENCIA_INTERNA":
            continue
        if movimiento.tipo == "INGRESO":
            ingresos.append(MovimientoFinancieroOut(
                fecha=movimiento.fecha,
                origen="CAJA",
                categoria=categoria,
                concepto=movimiento.concepto or "",
                monto=movimiento.monto,
                tipo="INGRESO",
                referencia=f"Caja #{movimiento.id}",
                banco_id=None,
                banco_nombre=None,
            ))
            total_ingresos += movimiento.monto
            ingresos_caja += movimiento.monto
        elif movimiento.tipo in {"EGRESO", "GASTO"}:
            egresos.append(MovimientoFinancieroOut(
                fecha=movimiento.fecha,
                origen="CAJA",
                categoria=categoria,
                concepto=movimiento.concepto or "",
                monto=movimiento.monto,
                tipo="EGRESO",
                referencia=f"Caja #{movimiento.id}",
                banco_id=None,
                banco_nombre=None,
            ))
            total_egresos += movimiento.monto
            egresos_caja += movimiento.monto
        elif movimiento.tipo == "AJUSTE":
            if movimiento.monto >= 0:
                ingresos.append(MovimientoFinancieroOut(
                    fecha=movimiento.fecha,
                    origen="CAJA",
                    categoria=categoria,
                    concepto=movimiento.concepto or "Ajuste de saldo (Positivo)",
                    monto=movimiento.monto,
                    tipo="AJUSTE (+)",
                    referencia=f"Caja #{movimiento.id}",
                    banco_id=None,
                    banco_nombre=None,
                ))
                total_ingresos += movimiento.monto
                ingresos_caja += movimiento.monto
            else:
                egresos.append(MovimientoFinancieroOut(
                    fecha=movimiento.fecha,
                    origen="CAJA",
                    categoria=categoria,
                    concepto=movimiento.concepto or "Ajuste de saldo (Negativo)",
                    monto=abs(movimiento.monto),
                    tipo="AJUSTE (-)",
                    referencia=f"Caja #{movimiento.id}",
                    banco_id=None,
                    banco_nombre=None,
                ))
                total_egresos += abs(movimiento.monto)
                egresos_caja += abs(movimiento.monto)

    for movimiento in movs_banco:
        categoria = _clasificar_movimiento("BANCO", movimiento)
        if categoria == "TRANSFERENCIA_INTERNA":
            continue
        if movimiento.tipo == "INGRESO":
            related_caja = session.query(MovimientoCaja).filter(MovimientoCaja.deposito_banco_id == movimiento.id).first()
            if related_caja:
                continue

            ingresos.append(MovimientoFinancieroOut(
                fecha=movimiento.fecha,
                origen="BANCO",
                categoria=categoria,
                concepto=movimiento.concepto or "",
                monto=movimiento.monto,
                tipo="INGRESO",
                referencia=f"Banco #{movimiento.id}",
                banco_id=movimiento.banco_id,
                banco_nombre=movimiento.banco_rel.nombre_banco if movimiento.banco_rel else None,
            ))
            total_ingresos += movimiento.monto
            ingresos_banco += movimiento.monto
        elif movimiento.tipo == "EGRESO":
            egresos.append(MovimientoFinancieroOut(
                fecha=movimiento.fecha,
                origen="BANCO",
                categoria=categoria,
                concepto=movimiento.concepto or "",
                monto=movimiento.monto,
                tipo="EGRESO",
                referencia=f"Banco #{movimiento.id}",
                banco_id=movimiento.banco_id,
                banco_nombre=movimiento.banco_rel.nombre_banco if movimiento.banco_rel else None,
            ))
            total_egresos += movimiento.monto
            egresos_banco += movimiento.monto

    todos = sorted([*ingresos, *egresos], key=lambda item: item.fecha, reverse=True)
    resultado_neto = total_ingresos - total_egresos
    margen = (resultado_neto / total_ingresos * 100) if total_ingresos > 0 else 0.0
    saldo_actual_caja = 0.0
    saldo_actual_bancos = 0.0
    if origen != "BANCO":
        from app.models.models import ConfiguracionCaja
        caja = session.query(ConfiguracionCaja).first()
        saldo_actual_caja = caja.saldo_actual if caja else 0.0
    bancos_query = session.query(Banco)
    if banco_id:
        bancos_query = bancos_query.filter(Banco.id == banco_id)
    saldo_actual_bancos = sum((banco.saldo_actual or 0.0) for banco in bancos_query.all())

    return ResumenReporteFinancieroOut(
        total_ingresos=total_ingresos,
        total_egresos=total_egresos,
        resultado_neto=resultado_neto,
        margen=margen,
        ingresos_caja=ingresos_caja,
        ingresos_banco=ingresos_banco,
        egresos_caja=egresos_caja,
        egresos_banco=egresos_banco,
        saldo_actual_caja=saldo_actual_caja,
        saldo_actual_bancos=saldo_actual_bancos,
        saldo_final_total=saldo_actual_caja + saldo_actual_bancos,
        ingresos=sorted(ingresos, key=lambda item: item.fecha, reverse=True),
        egresos=sorted(egresos, key=lambda item: item.fecha, reverse=True),
        todos=todos,
    )


def _inicio_fin_periodo(fecha_desde: Optional[date], fecha_hasta: Optional[date]):
    hoy = date.today()
    fecha_desde = fecha_desde or hoy.replace(day=1)
    fecha_hasta = fecha_hasta or hoy
    inicio = datetime.combine(fecha_desde, datetime.min.time())
    fin = datetime.combine(fecha_hasta, datetime.max.time())
    return fecha_desde, fecha_hasta, inicio, fin


def _obtener_datos_saldos_clientes(
    session: Session,
    fecha_desde: Optional[date],
    fecha_hasta: Optional[date],
    cliente_id: Optional[int] = None,
):
    fecha_desde, fecha_hasta, inicio, fin = _inicio_fin_periodo(fecha_desde, fecha_hasta)

    query = (
        session.query(Venta)
        .join(Cliente, Venta.cliente_id == Cliente.id)
        .filter(
            Venta.saldo > 0,
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
        )
    )

    if cliente_id:
        query = query.filter(Venta.cliente_id == cliente_id)

    ventas = query.order_by(Cliente.nombre.asc(), Venta.fecha.desc()).all()

    resumen_por_cliente = {}
    total_deuda = 0.0

    for venta in ventas:
        cliente = venta.cliente_rel
        if not cliente:
            continue

        total_deuda += float(venta.saldo or 0.0)
        item = resumen_por_cliente.setdefault(
            cliente.id,
            {
                "cliente_id": cliente.id,
                "cliente_nombre": cliente.nombre or "Cliente sin nombre",
                "cliente_ci": cliente.ci,
                "cliente_telefono": cliente.telefono,
                "cantidad_creditos": 0,
                "total_credito": 0.0,
                "total_pagado": 0.0,
                "saldo_pendiente": 0.0,
            },
        )

        item["cantidad_creditos"] += 1
        item["total_credito"] += float(venta.total or 0.0)
        item["total_pagado"] += float((venta.total or 0.0) - (venta.saldo or 0.0))
        item["saldo_pendiente"] += float(venta.saldo or 0.0)

    clientes = [
        SaldoClienteOut(**item)
        for item in sorted(
            resumen_por_cliente.values(),
            key=lambda row: (-(row["saldo_pendiente"] or 0.0), row["cliente_nombre"] or ""),
        )
    ]

    return ResumenSaldosClientesOut(
        clientes=clientes,
        total_deuda=total_deuda,
        cantidad_clientes=len(clientes),
        cantidad_creditos=sum(item.cantidad_creditos for item in clientes),
    )


def _obtener_detalle_saldo_cliente(
    session: Session,
    cliente_id: int,
    fecha_desde: Optional[date],
    fecha_hasta: Optional[date],
):
    fecha_desde, fecha_hasta, inicio, fin = _inicio_fin_periodo(fecha_desde, fecha_hasta)
    cliente = session.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")

    ventas_pendientes_query = (
        session.query(Venta)
        .filter(
            Venta.cliente_id == cliente_id,
            Venta.saldo > 0,
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
        )
        .order_by(Venta.fecha.desc())
    )

    ventas_pendientes = [
        VentaPendienteClienteOut(
            venta_id=venta.id,
            fecha=venta.fecha,
            codigo=venta.codigo,
            total=float(venta.total or 0.0),
            pagado=float((venta.total or 0.0) - (venta.saldo or 0.0)),
            saldo=float(venta.saldo or 0.0),
            estado=venta.estado or "PENDIENTE",
        )
        for venta in ventas_pendientes_query.all()
    ]

    ventas_mov = (
        session.query(Venta)
        .filter(
            Venta.cliente_id == cliente_id,
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
            Venta.fecha >= inicio,
            Venta.fecha <= fin,
        )
        .order_by(Venta.fecha.asc(), Venta.id.asc())
        .all()
    )

    pagos_mov = (
        session.query(Pago)
        .join(Venta, Pago.venta_id == Venta.id)
        .filter(
            Venta.cliente_id == cliente_id,
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
            Pago.fecha >= inicio,
            Pago.fecha <= fin,
        )
        .order_by(Pago.fecha.asc(), Pago.id.asc())
        .all()
    )

    movimientos_base = []
    for venta in ventas_mov:
        movimientos_base.append(
            {
                "fecha": venta.fecha,
                "tipo": "VENTA",
                "descripcion": f"Venta {venta.codigo}",
                "debito": float(venta.total or 0.0),
                "credito": 0.0,
                "orden": 0,
            }
        )

    for pago in pagos_mov:
        venta_codigo = pago.venta_rel.codigo if pago.venta_rel else f"#{pago.venta_id}"
        metodo = (pago.metodo_pago or "PAGO").strip().upper()
        movimientos_base.append(
            {
                "fecha": pago.fecha,
                "tipo": "PAGO",
                "descripcion": f"Pago s/ {venta_codigo} ({metodo})",
                "debito": 0.0,
                "credito": float(pago.monto or 0.0),
                "orden": 1,
            }
        )

    movimientos_base.sort(key=lambda row: (row["fecha"], row["orden"]))

    saldo_acumulado = 0.0
    movimientos = []
    for mov in movimientos_base:
        saldo_acumulado += float(mov["debito"] or 0.0) - float(mov["credito"] or 0.0)
        movimientos.append(
            MovimientoEstadoCuentaOut(
                fecha=mov["fecha"],
                tipo=mov["tipo"],
                descripcion=mov["descripcion"],
                debito=float(mov["debito"] or 0.0),
                credito=float(mov["credito"] or 0.0),
                saldo_acumulado=saldo_acumulado,
            )
        )

    return DetalleSaldoClienteOut(
        cliente_id=cliente.id,
        cliente_nombre=cliente.nombre or "Cliente sin nombre",
        cliente_ci=cliente.ci,
        cliente_telefono=cliente.telefono,
        total_deuda=sum(item.saldo for item in ventas_pendientes),
        ventas_pendientes=ventas_pendientes,
        movimientos=movimientos,
    )


@router.get("/ventas", response_model=ResumenReporteVentasOut)
def obtener_reporte_ventas(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    cliente_id: Optional[int] = Query(None),
    estado_pago: Optional[str] = Query(None),
    vendedor_id: Optional[int] = Query(None),
    canal_venta_id: Optional[int] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user = Depends(get_current_user)
):
    session = get_session_for_tenant(tenant_slug)
    try:
        resumen, _, _, _ = _obtener_datos_reporte_ventas(session, fecha_desde, fecha_hasta, cliente_id, estado_pago, vendedor_id, canal_venta_id)
        return resumen
    finally:
        session.close()


@router.get("/ventas/comparativo-mensual", response_model=ReporteComparativoMensualOut)
def obtener_reporte_comparativo_mensual(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    fecha_referencia: Optional[date] = Query(None),
    modo: str = Query("MES"),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        fecha_base = fecha_referencia or date.today()
        fecha_dt = datetime.combine(fecha_base, datetime.min.time())
        modo_normalizado = (modo or "MES").upper()
        if modo_normalizado not in ("MES", "DIA"):
            raise HTTPException(status_code=422, detail="Modo invalido. Use MES o DIA.")
        return _obtener_reporte_comparativo_mensual(session, fecha_dt, modo_normalizado)
    finally:
        session.close()


@router.get("/dashboard/comparativa-ventas", response_model=ComparativaVentasDashboardOut)
def obtener_comparativa_dashboard_ventas(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return _obtener_comparativa_dashboard(session)
    finally:
        session.close()


@router.get("/dashboard/resumen", response_model=DashboardResumenOut)
def obtener_resumen_dashboard(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return _obtener_resumen_dashboard(session)
    finally:
        session.close()


@router.get("/compras", response_model=ResumenReporteComprasOut)
def obtener_reporte_compras(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    proveedor_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    tipo_documento: Optional[str] = Query(None),
    condicion_pago: Optional[str] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        hoy = date.today()
        fecha_desde = fecha_desde or hoy.replace(day=1)
        fecha_hasta = fecha_hasta or hoy
        resumen, _ = _obtener_datos_reporte_compras(
            session,
            fecha_desde,
            fecha_hasta,
            proveedor_id,
            estado,
            tipo_documento,
            condicion_pago,
        )
        return resumen
    finally:
        session.close()


@router.get("/saldos", response_model=ResumenSaldosClientesOut)
def obtener_reporte_saldos_clientes(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    cliente_id: Optional[int] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return _obtener_datos_saldos_clientes(session, fecha_desde, fecha_hasta, cliente_id)
    finally:
        session.close()


@router.get("/saldos/{cliente_id}", response_model=DetalleSaldoClienteOut)
def obtener_detalle_saldo_cliente(
    cliente_id: int,
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return _obtener_detalle_saldo_cliente(session, cliente_id, fecha_desde, fecha_hasta)
    finally:
        session.close()


@router.get("/finanzas", response_model=ResumenReporteFinancieroOut)
def obtener_reporte_financiero(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    desde_inicio: bool = Query(False),
    origen: Optional[str] = Query(None),
    banco_id: Optional[int] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        hoy = date.today()
        if desde_inicio:
            fecha_desde = date(2000, 1, 1)
            fecha_hasta = hoy
        else:
            fecha_desde = fecha_desde or hoy.replace(day=1)
            fecha_hasta = fecha_hasta or hoy
        if origen:
            origen = origen.strip().upper()
            if origen not in {"CAJA", "BANCO"}:
                raise HTTPException(status_code=422, detail="origen invalido")
        if banco_id:
            banco = session.query(Banco).filter(Banco.id == banco_id).first()
            if not banco:
                raise HTTPException(status_code=404, detail="Banco no encontrado.")
        return _obtener_datos_reporte_financiero(session, fecha_desde, fecha_hasta, origen, banco_id)
    finally:
        session.close()


@router.get("/ventas/pdf")
def exportar_reporte_ventas_pdf(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    cliente_id: Optional[int] = Query(None),
    estado_pago: Optional[str] = Query(None),
    vendedor_id: Optional[int] = Query(None),
    canal_venta_id: Optional[int] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user = Depends(get_current_user)
):
    session = get_session_for_tenant(tenant_slug)
    try:
        _, ventas_data, com_ref, com_ban = _obtener_datos_reporte_ventas(
            session, fecha_desde, fecha_hasta, cliente_id, estado_pago, vendedor_id, canal_venta_id)
            
        config = session.query(ConfiguracionEmpresa).first()
        
        pdf_buffer = generar_pdf_reporte_ventas(
            ventas_data=ventas_data,
            config=config,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            total_comisiones_referidores=com_ref,
            total_comisiones_bancarias=com_ban
        )
        
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline; filename=reporte_ventas.pdf"}
        )
    finally:
        session.close()


@router.get("/compras/pdf")
def exportar_reporte_compras_pdf(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    proveedor_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    tipo_documento: Optional[str] = Query(None),
    condicion_pago: Optional[str] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        hoy = date.today()
        fecha_desde = fecha_desde or hoy.replace(day=1)
        fecha_hasta = fecha_hasta or hoy
        resumen, compras_data = _obtener_datos_reporte_compras(
            session,
            fecha_desde,
            fecha_hasta,
            proveedor_id,
            estado,
            tipo_documento,
            condicion_pago,
        )
        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_reporte_compras(resumen, compras_data, config, fecha_desde, fecha_hasta)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline; filename=reporte_compras.pdf"}
        )
    finally:
        session.close()


@router.get("/saldos/{cliente_id}/pdf")
def exportar_estado_cuenta_cliente_pdf(
    cliente_id: int,
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        fecha_desde, fecha_hasta, _, _ = _inicio_fin_periodo(fecha_desde, fecha_hasta)
        detalle = _obtener_detalle_saldo_cliente(session, cliente_id, fecha_desde, fecha_hasta)
        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_estado_cuenta_cliente(detalle, config, fecha_desde, fecha_hasta)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename=estado_cuenta_cliente_{cliente_id}.pdf"}
        )
    finally:
        session.close()


@router.get("/ventas/excel")
def exportar_reporte_ventas_excel(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    cliente_id: Optional[int] = Query(None),
    estado_pago: Optional[str] = Query(None),
    vendedor_id: Optional[int] = Query(None),
    canal_venta_id: Optional[int] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user = Depends(get_current_user)
):
    session = get_session_for_tenant(tenant_slug)
    try:
        _, ventas_data, com_ref, com_ban = _obtener_datos_reporte_ventas(
            session, fecha_desde, fecha_hasta, cliente_id, estado_pago, vendedor_id, canal_venta_id)
            
        config = session.query(ConfiguracionEmpresa).first()
        
        excel_buffer = generar_excel_reporte_ventas(
            ventas_data=ventas_data,
            config=config,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            total_comisiones_referidores=com_ref,
            total_comisiones_bancarias=com_ban
        )
        
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "inline; filename=reporte_ventas.xlsx"}
        )
    finally:
        session.close()


@router.get("/compras/excel")
def exportar_reporte_compras_excel(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    proveedor_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    tipo_documento: Optional[str] = Query(None),
    condicion_pago: Optional[str] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        hoy = date.today()
        fecha_desde = fecha_desde or hoy.replace(day=1)
        fecha_hasta = fecha_hasta or hoy
        resumen, compras_data = _obtener_datos_reporte_compras(
            session,
            fecha_desde,
            fecha_hasta,
            proveedor_id,
            estado,
            tipo_documento,
            condicion_pago,
        )
        config = session.query(ConfiguracionEmpresa).first()
        excel_buffer = generar_excel_reporte_compras(resumen, compras_data, config, fecha_desde, fecha_hasta)
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "inline; filename=reporte_compras.xlsx"}
        )
    finally:
        session.close()


@router.get("/finanzas/pdf")
def exportar_reporte_finanzas_pdf(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    desde_inicio: bool = Query(False),
    origen: Optional[str] = Query(None),
    banco_id: Optional[int] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        hoy = date.today()
        if desde_inicio:
            fecha_desde = date(2000, 1, 1)
            fecha_hasta = hoy
        else:
            fecha_desde = fecha_desde or hoy.replace(day=1)
            fecha_hasta = fecha_hasta or hoy
        if origen:
            origen = origen.strip().upper()
            if origen not in {"CAJA", "BANCO"}:
                raise HTTPException(status_code=422, detail="origen invalido")
        if banco_id:
            banco = session.query(Banco).filter(Banco.id == banco_id).first()
            if not banco:
                raise HTTPException(status_code=404, detail="Banco no encontrado.")

        resumen = _obtener_datos_reporte_financiero(session, fecha_desde, fecha_hasta, origen, banco_id)
        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_reporte_finanzas(resumen, config, fecha_desde, fecha_hasta)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline; filename=reporte_finanzas.pdf"}
        )
    finally:
        session.close()


@router.get("/finanzas/excel")
def exportar_reporte_finanzas_excel(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    desde_inicio: bool = Query(False),
    origen: Optional[str] = Query(None),
    banco_id: Optional[int] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        hoy = date.today()
        if desde_inicio:
            fecha_desde = date(2000, 1, 1)
            fecha_hasta = hoy
        else:
            fecha_desde = fecha_desde or hoy.replace(day=1)
            fecha_hasta = fecha_hasta or hoy
        if origen:
            origen = origen.strip().upper()
            if origen not in {"CAJA", "BANCO"}:
                raise HTTPException(status_code=422, detail="origen invalido")
        if banco_id:
            banco = session.query(Banco).filter(Banco.id == banco_id).first()
            if not banco:
                raise HTTPException(status_code=404, detail="Banco no encontrado.")

        resumen = _obtener_datos_reporte_financiero(session, fecha_desde, fecha_hasta, origen, banco_id)
        config = session.query(ConfiguracionEmpresa).first()
        excel_buffer = generar_excel_reporte_finanzas(resumen, config, fecha_desde, fecha_hasta)
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "inline; filename=reporte_finanzas.xlsx"}
        )
    finally:
        session.close()


def _obtener_trabajos_laboratorio(
    session: Session,
    fecha_desde: date,
    fecha_hasta: date,
    buscar: Optional[str] = None,
) -> ResumenTrabajosLaboratorioOut:
    query = (
        session.query(Venta)
        .filter(
            Venta.estado_entrega == "EN_LABORATORIO",
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
            Venta.fecha >= datetime.combine(fecha_desde, datetime.min.time()),
            Venta.fecha <= datetime.combine(fecha_hasta, datetime.max.time()),
        )
    )

    if buscar and buscar.strip():
        term = f"%{buscar.strip()}%"
        query = query.outerjoin(Cliente, Venta.cliente_id == Cliente.id).filter(
            or_(
                Venta.codigo.ilike(term),
                Cliente.nombre.ilike(term),
            )
        )

    ventas = query.order_by(Venta.fecha.desc(), Venta.id.desc()).all()
    trabajos = [
        TrabajoLaboratorioOut(
            venta_id=venta.id,
            fecha=venta.fecha,
            codigo=venta.codigo,
            cliente_id=venta.cliente_id,
            cliente_nombre=venta.cliente_rel.nombre if venta.cliente_rel else "N/A",
            detalle_trabajo=_detalle_trabajo_laboratorio(venta),
            saldo_pendiente=float(venta.saldo or 0.0),
        )
        for venta in ventas
    ]

    return ResumenTrabajosLaboratorioOut(
        trabajos=trabajos,
        total_trabajos=len(trabajos),
        total_saldo_pendiente=float(sum(item.saldo_pendiente for item in trabajos)),
    )


@router.get("/trabajos-laboratorio", response_model=ResumenTrabajosLaboratorioOut)
def obtener_reporte_trabajos_laboratorio(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    buscar: Optional[str] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        hoy = date.today()
        fecha_desde = fecha_desde or hoy.replace(day=1)
        fecha_hasta = fecha_hasta or hoy
        return _obtener_trabajos_laboratorio(session, fecha_desde, fecha_hasta, buscar)
    finally:
        session.close()


@router.get("/trabajos-laboratorio/pdf")
def exportar_reporte_trabajos_laboratorio_pdf(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    buscar: Optional[str] = Query(None),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        hoy = date.today()
        fecha_desde = fecha_desde or hoy.replace(day=1)
        fecha_hasta = fecha_hasta or hoy
        resumen = _obtener_trabajos_laboratorio(session, fecha_desde, fecha_hasta, buscar)
        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_reporte_trabajos_lab(resumen.trabajos, config, fecha_desde, fecha_hasta)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline; filename=reporte_trabajos_laboratorio.pdf"},
        )
    finally:
        session.close()
