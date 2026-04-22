"""HESAKA Web - Router: Clientes, Proveedores, Referidores, Vendedores y Canales"""
from datetime import date, datetime
from math import ceil
from typing import List, Optional
from zoneinfo import ZoneInfo, available_timezones

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.database import get_session_for_tenant
from app.middleware.tenant import get_tenant_slug
from app.models.clinica_models import ConsultaOftalmologica, Doctor as ClinicaDoctor, Paciente as ClinicaPaciente
from app.models.models import (
    Categoria,
    Cliente,
    Compra,
    ConfiguracionEmpresa,
    Pago,
    PagoCompra,
    Presupuesto,
    PresupuestoItem,
    Producto,
    Proveedor,
    Referidor,
    Vendedor,
    CanalVenta,
    Venta,
)
from app.schemas.schemas import (
    BackupCreateOut,
    BackupItemOut,
    BackupListOut,
    BackupRestoreIn,
    BackupRestoreOut,
    ConfiguracionGeneralEstadoOut,
    ConfiguracionGeneralOut,
    ConfiguracionGeneralPublicaOut,
    ConfiguracionGeneralUpdate,
    CanalVentaCreate,
    CanalVentaListItemOut,
    CanalVentaListResponseOut,
    CanalVentaOut,
    ClienteCreate,
    ClienteCumpleanosOut,
    ClienteListItemOut,
    ClienteListResponseOut,
    ClienteOut,
    ProveedorCreate,
    ProveedorListItemOut,
    ProveedorListResponseOut,
    ProveedorOut,
    ReferidorCreate,
    ReferidorListItemOut,
    ReferidorListResponseOut,
    ReferidorOut,
    VendedorCreate,
    VendedorListItemOut,
    VendedorListResponseOut,
    VendedorOut,
)
from app.utils.backup_restore import create_backup, list_backups, restore_backup, restore_uploaded_backup
from app.utils.auth import get_current_user, require_admin
from app.config import settings
from app.utils.configuracion_general import (
    configuracion_general_completa,
    obtener_canal_principal,
    obtener_o_crear_configuracion_empresa,
    sincronizar_canal_principal,
)
from app.utils.media_storage import save_logo_for_tenant
from app.utils.excel_reporte_clientes import generar_excel_reporte_clientes
from app.utils.filename_utils import sanitize_filename_component
from app.utils.pdf_fichas import generar_pdf_ficha_cliente, generar_pdf_ficha_proveedor
from app.utils.pdf_reporte_clientes import generar_pdf_reporte_clientes

router = APIRouter(prefix="/api/clientes", tags=["Clientes"])
prov_router = APIRouter(prefix="/api/proveedores", tags=["Proveedores"])
ref_router = APIRouter(prefix="/api/referidores", tags=["Referidores"])
vend_router = APIRouter(prefix="/api/vendedores", tags=["Vendedores"])
canal_router = APIRouter(prefix="/api/canales-venta", tags=["Canales Venta"])
config_router = APIRouter(prefix="/api/configuracion-general", tags=["Configuracion General"])


class MovimientoFichaOut(BaseModel):
    fecha: datetime
    tipo: str
    descripcion: str
    debito: float
    credito: float
    saldo_acumulado: float


class VentaPendienteFichaOut(BaseModel):
    venta_id: int
    fecha: datetime
    codigo: str
    total: float
    pagado: float
    saldo: float
    estado: str


class CompraPendienteFichaOut(BaseModel):
    compra_id: int
    fecha: datetime
    documento: str
    total: float
    pagado: float
    saldo: float
    estado: str
    condicion_pago: Optional[str] = None
    fecha_vencimiento: Optional[datetime] = None


class ClienteFichaOut(BaseModel):
    cliente: ClienteOut
    deuda_total: float
    movimientos: List[MovimientoFichaOut]
    ventas_pendientes: List[VentaPendienteFichaOut]
    ultima_graduacion: Optional["GraduacionClienteFichaOut"] = None
    proximo_control: Optional[date] = None
    proximo_control_origen: Optional[str] = None
    historial_armazones: List["ArmazonHistorialItemOut"] = []


class ProveedorFichaOut(BaseModel):
    proveedor: ProveedorOut
    deuda_total: float
    movimientos: List[MovimientoFichaOut]
    compras_pendientes: List[CompraPendienteFichaOut]


class GraduacionClienteFichaOut(BaseModel):
    presupuesto_id: int
    codigo_presupuesto: str
    fecha_presupuesto: datetime
    fecha_receta: Optional[datetime] = None
    fecha_control: Optional[date] = None
    origen: Optional[str] = None
    consulta_tipo: Optional[str] = None
    doctor: Optional[str] = None
    observaciones: Optional[str] = None
    od_esfera: Optional[str] = None
    od_cilindro: Optional[str] = None
    od_eje: Optional[str] = None
    od_adicion: Optional[str] = None
    oi_esfera: Optional[str] = None
    oi_cilindro: Optional[str] = None
    oi_eje: Optional[str] = None
    oi_adicion: Optional[str] = None


class ArmazonHistorialItemOut(BaseModel):
    fecha: datetime
    producto: str
    codigo_producto: Optional[str] = None
    codigo_armazon: Optional[str] = None
    medidas: Optional[str] = None
    precio_venta: float
    venta_codigo: Optional[str] = None
    graduacion: Optional[GraduacionClienteFichaOut] = None


ClienteFichaOut.model_rebuild()


def _construir_query_clientes(session, buscar: Optional[str], referidor_id: Optional[int]):
    query = session.query(Cliente)
    if referidor_id:
        query = query.filter(Cliente.referidor_id == referidor_id)
    if buscar and buscar.strip():
        term = f"%{buscar.strip()}%"
        query = query.filter(
            Cliente.nombre.ilike(term)
            | Cliente.ci.ilike(term)
            | Cliente.telefono.ilike(term)
        )
    return query


def _calcular_edad(fecha_nacimiento: date | None, fecha_referencia: date | None = None) -> int | None:
    if not fecha_nacimiento:
        return None
    referencia = fecha_referencia or date.today()
    return referencia.year - fecha_nacimiento.year - (
        (referencia.month, referencia.day) < (fecha_nacimiento.month, fecha_nacimiento.day)
    )


def _construir_query_proveedores(session, buscar: Optional[str]):
    query = session.query(Proveedor)
    if buscar and buscar.strip():
        term = f"%{buscar.strip()}%"
        query = query.filter(
            Proveedor.nombre.ilike(term)
            | Proveedor.telefono.ilike(term)
            | Proveedor.email.ilike(term)
            | Proveedor.direccion.ilike(term)
        )
    return query


def _construir_query_referidores(session, buscar: Optional[str]):
    query = session.query(Referidor)
    if buscar and buscar.strip():
        term = f"%{buscar.strip()}%"
        query = query.filter(
            Referidor.nombre.ilike(term)
            | Referidor.telefono.ilike(term)
            | Referidor.tipo_comision.ilike(term)
        )
    return query


def _serializar_configuracion_general(session, config: ConfiguracionEmpresa) -> ConfiguracionGeneralOut:
    canal_principal = obtener_canal_principal(session)
    return ConfiguracionGeneralOut(
        id=config.id,
        nombre=config.nombre or "",
        ruc=config.ruc,
        direccion=config.direccion,
        telefono=config.telefono,
        email=config.email,
        logo_path=config.logo_path,
        business_timezone=(config.business_timezone or settings.BUSINESS_TIMEZONE or "America/Asuncion"),
        canal_principal_nombre=canal_principal.nombre if canal_principal else None,
        configuracion_completa=configuracion_general_completa(config),
    )


def _serializar_backup(info) -> BackupItemOut:
    return BackupItemOut(
        filename=info.filename,
        size_bytes=info.size_bytes,
        created_at=info.created_at,
    )


@config_router.get("/", response_model=ConfiguracionGeneralOut)
def obtener_configuracion_general(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        config = obtener_o_crear_configuracion_empresa(session)
        session.commit()
        session.refresh(config)
        return _serializar_configuracion_general(session, config)
    finally:
        session.close()


@config_router.get("/publica", response_model=ConfiguracionGeneralPublicaOut)
def obtener_configuracion_general_publica(
    tenant_slug: str = Depends(get_tenant_slug),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        config = obtener_o_crear_configuracion_empresa(session)
        session.commit()
        canal_principal = obtener_canal_principal(session)
        return ConfiguracionGeneralPublicaOut(
            nombre=(config.nombre or "").strip() or "HESAKA Web",
            logo_path=config.logo_path,
            canal_principal_nombre=canal_principal.nombre if canal_principal else None,
        )
    finally:
        session.close()


@config_router.get("/estado", response_model=ConfiguracionGeneralEstadoOut)
def obtener_estado_configuracion_general(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        config = session.query(ConfiguracionEmpresa).first()
        canal_principal = obtener_canal_principal(session)
        return ConfiguracionGeneralEstadoOut(
            configuracion_completa=configuracion_general_completa(config),
            nombre_negocio=(config.nombre or "").strip() or None if config else None,
            canal_principal_nombre=canal_principal.nombre if canal_principal else None,
        )
    finally:
        session.close()


@config_router.get("/timezones", response_model=List[dict])
def listar_zonas_horarias_configuracion_general(
    current_user=Depends(get_current_user),
):
    ahora_utc = datetime.now(ZoneInfo("UTC"))
    items = []
    for tz_name in sorted(available_timezones()):
        tz = ZoneInfo(tz_name)
        offset = ahora_utc.astimezone(tz).utcoffset()
        total_min = int((offset.total_seconds() if offset else 0) // 60)
        sign = "+" if total_min >= 0 else "-"
        abs_min = abs(total_min)
        hh = abs_min // 60
        mm = abs_min % 60
        offset_label = f"UTC{sign}{hh:02d}:{mm:02d}"
        items.append(
            {
                "id": tz_name,
                "label": f"{tz_name} ({offset_label})",
                "offset_minutes": total_min,
                "offset_label": offset_label,
            }
        )
    items.sort(key=lambda item: (item["offset_minutes"], item["id"]))
    return items


@config_router.put("/", response_model=ConfiguracionGeneralOut)
def actualizar_configuracion_general(
    data: ConfiguracionGeneralUpdate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        config = obtener_o_crear_configuracion_empresa(session)
        nombre_anterior = config.nombre

        config.nombre = data.nombre
        config.ruc = data.ruc
        config.direccion = data.direccion
        config.telefono = data.telefono
        config.email = data.email
        config.logo_path = data.logo_path
        config.business_timezone = data.business_timezone or (settings.BUSINESS_TIMEZONE or "America/Asuncion")

        sincronizar_canal_principal(session, config, nombre_anterior)
        session.commit()
        session.refresh(config)
        return _serializar_configuracion_general(session, config)
    finally:
        session.close()


@config_router.post("/logo", response_model=ConfiguracionGeneralOut)
def subir_logo_configuracion_general(
    logo: UploadFile = File(...),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        config = obtener_o_crear_configuracion_empresa(session)
        config.logo_path = save_logo_for_tenant(tenant_slug, logo)
        session.commit()
        session.refresh(config)
        return _serializar_configuracion_general(session, config)
    finally:
        session.close()


@config_router.get("/backups", response_model=BackupListOut)
def obtener_backups_configuracion_general(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    backups = [_serializar_backup(item) for item in list_backups(tenant_slug)]
    return BackupListOut(items=backups)


@config_router.post("/backups", response_model=BackupCreateOut)
def crear_backup_configuracion_general(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    try:
        backup = create_backup(tenant_slug)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return BackupCreateOut(
        message="Backup generado correctamente.",
        backup=_serializar_backup(backup),
    )


@config_router.post("/backups/{filename}/restore", response_model=BackupRestoreOut)
def restaurar_backup_configuracion_general(
    filename: str,
    data: BackupRestoreIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    if data.confirm_filename != filename:
        raise HTTPException(
            status_code=400,
            detail="La confirmacion no coincide con el backup seleccionado.",
        )

    try:
        backup = restore_backup(tenant_slug, filename)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return BackupRestoreOut(
        message="Backup restaurado correctamente.",
        backup=_serializar_backup(backup),
    )


@config_router.post("/backups/restore-upload", response_model=BackupRestoreOut)
def restaurar_backup_subido_configuracion_general(
    confirm_filename: str = Form(...),
    backup_file: UploadFile = File(...),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    uploaded_name = (backup_file.filename or "").strip()
    if confirm_filename != uploaded_name:
        raise HTTPException(
            status_code=400,
            detail="La confirmacion no coincide con el archivo seleccionado.",
        )

    try:
        backup = restore_uploaded_backup(tenant_slug, backup_file)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return BackupRestoreOut(
        message="Backup externo restaurado correctamente.",
        backup=_serializar_backup(backup),
    )


@config_router.get("/backups/{filename}/download")
def descargar_backup_configuracion_general(
    filename: str,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    backups = {item.filename: item for item in list_backups(tenant_slug)}
    backup = backups.get(filename)
    if not backup:
        raise HTTPException(status_code=404, detail="El backup solicitado no existe.")

    return FileResponse(
        path=backup.path,
        media_type="application/octet-stream",
        filename=backup.filename,
    )


def _build_cliente_ficha(session, cliente: Cliente):
    ventas = (
        session.query(Venta)
        .filter(
            Venta.cliente_id == cliente.id,
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
        )
        .order_by(Venta.fecha.asc(), Venta.id.asc())
        .all()
    )

    pagos = (
        session.query(Pago)
        .join(Venta, Pago.venta_id == Venta.id)
        .filter(
            Venta.cliente_id == cliente.id,
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
        )
        .order_by(Pago.fecha.asc(), Pago.id.asc())
        .all()
    )

    movimientos_raw = []
    for venta in ventas:
        movimientos_raw.append({
            "fecha": venta.fecha,
            "tipo": "VENTA",
            "descripcion": f"Venta {venta.codigo}",
            "debito": float(venta.total or 0.0),
            "credito": 0.0,
            "orden": 0,
        })
    for pago in pagos:
        codigo = pago.venta_rel.codigo if pago.venta_rel else f"#{pago.venta_id}"
        metodo = (pago.metodo_pago or "PAGO").strip().upper()
        movimientos_raw.append({
            "fecha": pago.fecha,
            "tipo": "PAGO",
            "descripcion": f"Pago s/ {codigo} ({metodo})",
            "debito": 0.0,
            "credito": float(pago.monto or 0.0),
            "orden": 1,
        })

    # Orden logico para lectura de estado de cuenta:
    # primero la venta del dia y luego los pagos aplicados ese mismo dia.
    movimientos_raw.sort(key=lambda item: (item["fecha"].date() if item["fecha"] else datetime.min.date(), item["orden"], item["fecha"] or datetime.min))
    saldo = 0.0
    movimientos = []
    for item in movimientos_raw:
        saldo += item["debito"] - item["credito"]
        movimientos.append(MovimientoFichaOut(
            fecha=item["fecha"],
            tipo=item["tipo"],
            descripcion=item["descripcion"],
            debito=item["debito"],
            credito=item["credito"],
            saldo_acumulado=saldo,
        ))

    ventas_pendientes = [
        VentaPendienteFichaOut(
            venta_id=venta.id,
            fecha=venta.fecha,
            codigo=venta.codigo,
            total=float(venta.total or 0.0),
            pagado=float((venta.total or 0.0) - (venta.saldo or 0.0)),
            saldo=float(venta.saldo or 0.0),
            estado=venta.estado or "PENDIENTE",
        )
        for venta in sorted(
            [venta for venta in ventas if (venta.saldo or 0.0) > 0],
            key=lambda item: item.fecha,
            reverse=True,
        )
    ]

    cliente_out = ClienteOut.model_validate(cliente)
    cliente_out.referidor_nombre = cliente.referidor_rel.nombre if cliente.referidor_rel else None

    ultima_grad_presupuesto = (
        session.query(Presupuesto)
        .filter(
            Presupuesto.cliente_id == cliente.id,
            Presupuesto.graduacion_od_esfera.isnot(None),
        )
        .order_by(Presupuesto.fecha.desc(), Presupuesto.id.desc())
        .first()
    )

    ultima_grad_consulta = (
        session.query(ConsultaOftalmologica, ClinicaDoctor.nombre_completo.label("doctor_nombre"))
        .join(ClinicaPaciente, ClinicaPaciente.id == ConsultaOftalmologica.paciente_id)
        .outerjoin(ClinicaDoctor, ClinicaDoctor.id == ConsultaOftalmologica.doctor_id)
        .filter(
            ClinicaPaciente.cliente_id == cliente.id,
            or_(
                ConsultaOftalmologica.ref_od_esfera.isnot(None),
                ConsultaOftalmologica.ref_od_cilindro.isnot(None),
                ConsultaOftalmologica.ref_od_eje.isnot(None),
                ConsultaOftalmologica.ref_od_adicion.isnot(None),
                ConsultaOftalmologica.ref_oi_esfera.isnot(None),
                ConsultaOftalmologica.ref_oi_cilindro.isnot(None),
                ConsultaOftalmologica.ref_oi_eje.isnot(None),
                ConsultaOftalmologica.ref_oi_adicion.isnot(None),
            ),
        )
        .order_by(ConsultaOftalmologica.fecha.desc(), ConsultaOftalmologica.id.desc())
        .first()
    )

    ultima_graduacion = None
    fecha_presupuesto = ultima_grad_presupuesto.fecha if ultima_grad_presupuesto and ultima_grad_presupuesto.fecha else None
    consulta_row = ultima_grad_consulta[0] if ultima_grad_consulta else None
    consulta_doctor = ultima_grad_consulta[1] if ultima_grad_consulta else None
    fecha_consulta = consulta_row.fecha if consulta_row and consulta_row.fecha else None

    if fecha_consulta and (not fecha_presupuesto or fecha_consulta >= fecha_presupuesto):
        ultima_graduacion = GraduacionClienteFichaOut(
            presupuesto_id=consulta_row.id,
            codigo_presupuesto=f"CONS-{consulta_row.id}",
            fecha_presupuesto=consulta_row.fecha,
            fecha_receta=consulta_row.fecha,
            fecha_control=consulta_row.fecha_control,
            origen="CONSULTA",
            consulta_tipo="OFTALMOLOGIA",
            doctor=consulta_doctor,
            observaciones=consulta_row.observaciones,
            od_esfera=consulta_row.ref_od_esfera,
            od_cilindro=consulta_row.ref_od_cilindro,
            od_eje=consulta_row.ref_od_eje,
            od_adicion=consulta_row.ref_od_adicion,
            oi_esfera=consulta_row.ref_oi_esfera,
            oi_cilindro=consulta_row.ref_oi_cilindro,
            oi_eje=consulta_row.ref_oi_eje,
            oi_adicion=consulta_row.ref_oi_adicion,
        )
    elif ultima_grad_presupuesto:
        ultima_graduacion = GraduacionClienteFichaOut(
            presupuesto_id=ultima_grad_presupuesto.id,
            codigo_presupuesto=ultima_grad_presupuesto.codigo,
            fecha_presupuesto=ultima_grad_presupuesto.fecha,
            fecha_receta=ultima_grad_presupuesto.fecha_receta,
            fecha_control=ultima_grad_presupuesto.fecha_proximo_control,
            origen="PRESUPUESTO",
            doctor=ultima_grad_presupuesto.doctor_receta,
            observaciones=ultima_grad_presupuesto.observaciones,
            od_esfera=ultima_grad_presupuesto.graduacion_od_esfera,
            od_cilindro=ultima_grad_presupuesto.graduacion_od_cilindro,
            od_eje=ultima_grad_presupuesto.graduacion_od_eje,
            od_adicion=ultima_grad_presupuesto.graduacion_od_adicion,
            oi_esfera=ultima_grad_presupuesto.graduacion_oi_esfera,
            oi_cilindro=ultima_grad_presupuesto.graduacion_oi_cilindro,
            oi_eje=ultima_grad_presupuesto.graduacion_oi_eje,
            oi_adicion=ultima_grad_presupuesto.graduacion_oi_adicion,
        )

    proximo_control = None
    proximo_control_origen = None
    fecha_control_presupuesto = (
        ultima_grad_presupuesto.fecha_proximo_control
        if ultima_grad_presupuesto and not bool(ultima_grad_presupuesto.no_requiere_proximo_control)
        else None
    )
    fecha_control_consulta = consulta_row.fecha_control if consulta_row else None

    if fecha_control_consulta and (not fecha_presupuesto or (fecha_consulta and fecha_consulta >= fecha_presupuesto)):
        proximo_control = fecha_control_consulta
        proximo_control_origen = "CONSULTA"
    elif fecha_control_presupuesto:
        proximo_control = fecha_control_presupuesto
        proximo_control_origen = "PRESUPUESTO"
    elif fecha_control_consulta:
        proximo_control = fecha_control_consulta
        proximo_control_origen = "CONSULTA"

    keywords = ["ARMAZON", "ARMAZONES", "ARMAZON ", "MONTURA", "MARCO", "GABINETE"]
    armazon_conditions = []
    for keyword in keywords:
        term = f"%{keyword}%"
        armazon_conditions.append(Producto.nombre.ilike(term))
        armazon_conditions.append(Categoria.nombre.ilike(term))

    historial_items = (
        session.query(PresupuestoItem)
        .join(Presupuesto, PresupuestoItem.presupuesto_id == Presupuesto.id)
        .join(Venta, Venta.presupuesto_id == Presupuesto.id)
        .join(Producto, PresupuestoItem.producto_id == Producto.id)
        .join(Categoria, Producto.categoria_id == Categoria.id)
        .filter(
            Venta.cliente_id == cliente.id,
            Venta.estado.notin_(["ANULADO", "ANULADA"]),
            or_(*armazon_conditions),
        )
        .order_by(Venta.fecha.desc(), PresupuestoItem.id.desc())
        .all()
    )

    historial_armazones = []
    for item in historial_items:
        presupuesto = item.presupuesto_rel
        venta = None
        if presupuesto and presupuesto.venta_rel:
            venta_rel = presupuesto.venta_rel
            venta = venta_rel[0] if isinstance(venta_rel, list) else venta_rel

        graduacion = None
        if presupuesto:
            graduacion = GraduacionClienteFichaOut(
                presupuesto_id=presupuesto.id,
                codigo_presupuesto=presupuesto.codigo,
                fecha_presupuesto=presupuesto.fecha,
                fecha_receta=presupuesto.fecha_receta,
                fecha_control=presupuesto.fecha_proximo_control,
                origen="PRESUPUESTO",
                doctor=presupuesto.doctor_receta,
                observaciones=presupuesto.observaciones,
                od_esfera=presupuesto.graduacion_od_esfera,
                od_cilindro=presupuesto.graduacion_od_cilindro,
                od_eje=presupuesto.graduacion_od_eje,
                od_adicion=presupuesto.graduacion_od_adicion,
                oi_esfera=presupuesto.graduacion_oi_esfera,
                oi_cilindro=presupuesto.graduacion_oi_cilindro,
                oi_eje=presupuesto.graduacion_oi_eje,
                oi_adicion=presupuesto.graduacion_oi_adicion,
            )

        historial_armazones.append(
            ArmazonHistorialItemOut(
                fecha=presupuesto.fecha if presupuesto else cliente.fecha_registro or datetime.now(),
                producto=item.producto_rel.nombre if item.producto_rel else (item.descripcion or "-"),
                codigo_producto=item.producto_rel.codigo if item.producto_rel else None,
                codigo_armazon=item.codigo_armazon or "-",
                medidas=item.medidas_armazon or "-",
                precio_venta=float(item.precio_unitario or 0.0),
                venta_codigo=venta.codigo if venta else None,
                graduacion=graduacion,
            )
        )

    return ClienteFichaOut(
        cliente=cliente_out,
        deuda_total=sum(item.saldo for item in ventas_pendientes),
        movimientos=movimientos,
        ventas_pendientes=ventas_pendientes,
        ultima_graduacion=ultima_graduacion,
        proximo_control=proximo_control,
        proximo_control_origen=proximo_control_origen,
        historial_armazones=historial_armazones,
    )


def _build_proveedor_ficha(session, proveedor: Proveedor):
    compras = (
        session.query(Compra)
        .filter(
            Compra.proveedor_id == proveedor.id,
            Compra.estado != "ANULADO",
        )
        .order_by(Compra.fecha.asc(), Compra.id.asc())
        .all()
    )

    pagos = (
        session.query(PagoCompra)
        .join(Compra, PagoCompra.compra_id == Compra.id)
        .filter(
            Compra.proveedor_id == proveedor.id,
            PagoCompra.estado != "ANULADO",
            Compra.estado != "ANULADO",
        )
        .order_by(PagoCompra.fecha.asc(), PagoCompra.id.asc())
        .all()
    )

    movimientos_raw = []
    for compra in compras:
        documento = f"{compra.tipo_documento or 'DOC'} {compra.nro_factura or ''}".strip()
        movimientos_raw.append({
            "fecha": compra.fecha,
            "tipo": "COMPRA",
            "descripcion": documento,
            "debito": 0.0,
            "credito": float(compra.total or 0.0),
            "orden": 0,
        })
    for pago in pagos:
        compra = pago.compra_rel
        documento = f"{compra.tipo_documento or 'DOC'} {compra.nro_factura or ''}".strip() if compra else f"Compra #{pago.compra_id}"
        metodo = (pago.metodo_pago or "PAGO").strip().upper()
        movimientos_raw.append({
            "fecha": pago.fecha,
            "tipo": "PAGO",
            "descripcion": f"Pago s/ {documento} ({metodo})",
            "debito": float(pago.monto or 0.0),
            "credito": 0.0,
            "orden": 1,
        })

    # En proveedores tambien conviene ver primero la compra del dia
    # y luego los pagos asociados para que el saldo acumulado sea legible.
    movimientos_raw.sort(key=lambda item: (item["fecha"].date() if item["fecha"] else datetime.min.date(), item["orden"], item["fecha"] or datetime.min))
    saldo = 0.0
    movimientos = []
    for item in movimientos_raw:
        saldo += item["credito"] - item["debito"]
        movimientos.append(MovimientoFichaOut(
            fecha=item["fecha"],
            tipo=item["tipo"],
            descripcion=item["descripcion"],
            debito=item["debito"],
            credito=item["credito"],
            saldo_acumulado=saldo,
        ))

    compras_pendientes = [
        CompraPendienteFichaOut(
            compra_id=compra.id,
            fecha=compra.fecha,
            documento=f"{compra.tipo_documento or 'DOC'} {compra.nro_factura or ''}".strip(),
            total=float(compra.total or 0.0),
            pagado=float((compra.total or 0.0) - (compra.saldo or 0.0)),
            saldo=float(compra.saldo or 0.0),
            estado=compra.estado or "PENDIENTE",
            condicion_pago=compra.condicion_pago,
            fecha_vencimiento=compra.fecha_vencimiento,
        )
        for compra in sorted(
            [compra for compra in compras if (compra.saldo or 0.0) > 0],
            key=lambda item: item.fecha,
            reverse=True,
        )
    ]

    return ProveedorFichaOut(
        proveedor=ProveedorOut.model_validate(proveedor),
        deuda_total=sum(item.saldo for item in compras_pendientes),
        movimientos=movimientos,
        compras_pendientes=compras_pendientes,
    )


@router.get("/", response_model=List[ClienteOut])
def listar_clientes(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    buscar: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = _construir_query_clientes(session, buscar, None)
        clientes = query.order_by(Cliente.nombre.asc()).offset(skip).limit(limit).all()
        result = []
        for cliente in clientes:
            item = ClienteOut.model_validate(cliente)
            item.referidor_nombre = cliente.referidor_rel.nombre if cliente.referidor_rel else None
            result.append(item)
        return result
    finally:
        session.close()


@router.get("/listado-optimizado", response_model=ClienteListResponseOut)
def listar_clientes_optimizado(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    buscar: Optional[str] = Query(None),
    referidor_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = _construir_query_clientes(session, buscar, referidor_id)
        total = query.count()
        total_pages = ceil(total / page_size) if total else 1
        offset = (page - 1) * page_size
        clientes = query.order_by(Cliente.nombre.asc()).offset(offset).limit(page_size).all()

        items = [
            ClienteListItemOut(
                id=cliente.id,
                nombre=cliente.nombre,
                ci=cliente.ci,
                telefono=cliente.telefono,
                email=cliente.email,
                direccion=cliente.direccion,
                fecha_nacimiento=cliente.fecha_nacimiento,
                fecha_registro=cliente.fecha_registro,
                notas=cliente.notas,
                referidor_id=cliente.referidor_id,
                referidor_nombre=cliente.referidor_rel.nombre if cliente.referidor_rel else None,
            )
            for cliente in clientes
        ]

        return ClienteListResponseOut(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        )
    finally:
        session.close()


@router.get("/reporte/pdf")
def exportar_clientes_pdf(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    buscar: Optional[str] = Query(None),
    referidor_id: Optional[int] = Query(None),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        clientes = _construir_query_clientes(session, buscar, referidor_id).order_by(Cliente.nombre.asc()).all()
        config = session.query(ConfiguracionEmpresa).first()
        referidor = session.query(Referidor).filter(Referidor.id == referidor_id).first() if referidor_id else None
        pdf_buffer = generar_pdf_reporte_clientes(
            clientes=clientes,
            config=config,
            buscar=buscar,
            referidor_nombre=referidor.nombre if referidor else None,
        )
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="reporte_clientes_{sanitize_filename_component(referidor.nombre if referidor else buscar, "general")}.pdf"'},
        )
    finally:
        session.close()


@router.get("/reporte/excel")
def exportar_clientes_excel(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    buscar: Optional[str] = Query(None),
    referidor_id: Optional[int] = Query(None),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        clientes = _construir_query_clientes(session, buscar, referidor_id).order_by(Cliente.nombre.asc()).all()
        config = session.query(ConfiguracionEmpresa).first()
        referidor = session.query(Referidor).filter(Referidor.id == referidor_id).first() if referidor_id else None
        excel_buffer = generar_excel_reporte_clientes(
            clientes=clientes,
            config=config,
            buscar=buscar,
            referidor_nombre=referidor.nombre if referidor else None,
        )
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'inline; filename="reporte_clientes.xlsx"'},
        )
    finally:
        session.close()


@router.get("/cumpleanos", response_model=List[ClienteCumpleanosOut])
def listar_cumpleanos_clientes(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    fecha: date | None = Query(default=None),
):
    fecha_objetivo = fecha or date.today()
    session = get_session_for_tenant(tenant_slug)
    try:
        resultados: list[ClienteCumpleanosOut] = []
        cliente_ids_cubiertos: set[int] = set()

        pacientes = (
            session.query(ClinicaPaciente)
            .filter(ClinicaPaciente.fecha_nacimiento.isnot(None))
            .all()
        )
        cumpleaneros_pacientes = [
            paciente for paciente in pacientes
            if paciente.fecha_nacimiento
            and paciente.fecha_nacimiento.month == fecha_objetivo.month
            and paciente.fecha_nacimiento.day == fecha_objetivo.day
        ]
        for paciente in cumpleaneros_pacientes:
            resultados.append(ClienteCumpleanosOut(
                id=paciente.id,
                nombre=paciente.nombre_completo,
                ci=paciente.ci_pasaporte,
                telefono=paciente.telefono or (paciente.cliente_rel.telefono if paciente.cliente_rel else None),
                email=paciente.cliente_rel.email if paciente.cliente_rel else None,
                fecha_nacimiento=paciente.fecha_nacimiento,
                edad=_calcular_edad(paciente.fecha_nacimiento, fecha_objetivo),
                referidor_nombre=paciente.referidor_rel.nombre if paciente.referidor_rel else None,
            ))
            if paciente.cliente_id:
                cliente_ids_cubiertos.add(paciente.cliente_id)

        clientes = (
            session.query(Cliente)
            .filter(Cliente.fecha_nacimiento.isnot(None))
            .all()
        )
        cumpleaneros_clientes = [
            cliente for cliente in clientes
            if cliente.id not in cliente_ids_cubiertos
            and cliente.fecha_nacimiento
            and cliente.fecha_nacimiento.month == fecha_objetivo.month
            and cliente.fecha_nacimiento.day == fecha_objetivo.day
        ]

        for cliente in cumpleaneros_clientes:
            # Se usa id negativo para evitar colision de keys con ids de pacientes en frontend.
            resultados.append(ClienteCumpleanosOut(
                id=-cliente.id,
                nombre=cliente.nombre,
                ci=cliente.ci,
                telefono=cliente.telefono,
                email=cliente.email,
                fecha_nacimiento=cliente.fecha_nacimiento,
                edad=_calcular_edad(cliente.fecha_nacimiento, fecha_objetivo),
                referidor_nombre=cliente.referidor_rel.nombre if cliente.referidor_rel else None,
            ))

        resultados.sort(key=lambda item: (item.nombre or "").lower())
        return resultados
    finally:
        session.close()


@router.post("/cumpleanos/sincronizar-desde-pacientes")
def sincronizar_cumpleanos_clientes_desde_pacientes(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        pacientes = (
            session.query(ClinicaPaciente)
            .filter(
                ClinicaPaciente.cliente_id.isnot(None),
                ClinicaPaciente.fecha_nacimiento.isnot(None),
            )
            .all()
        )

        actualizados = 0
        sin_cambios = 0
        cliente_no_encontrado = 0

        for paciente in pacientes:
            cliente = session.query(Cliente).filter(Cliente.id == paciente.cliente_id).first()
            if not cliente:
                cliente_no_encontrado += 1
                continue
            if cliente.fecha_nacimiento:
                sin_cambios += 1
                continue
            cliente.fecha_nacimiento = paciente.fecha_nacimiento
            actualizados += 1

        session.commit()
        return {
            "ok": True,
            "mensaje": "Sincronizacion de cumpleanos completada.",
            "pacientes_revisados": len(pacientes),
            "clientes_actualizados": actualizados,
            "clientes_sin_cambios": sin_cambios,
            "cliente_no_encontrado": cliente_no_encontrado,
        }
    finally:
        session.close()


@router.get("/{cliente_id}", response_model=ClienteOut)
def obtener_cliente(
    cliente_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        cliente = session.query(Cliente).filter(Cliente.id == cliente_id).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        item = ClienteOut.model_validate(cliente)
        item.referidor_nombre = cliente.referidor_rel.nombre if cliente.referidor_rel else None
        return item
    finally:
        session.close()


@router.get("/{cliente_id}/ficha", response_model=ClienteFichaOut)
def obtener_ficha_cliente(
    cliente_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        cliente = session.query(Cliente).filter(Cliente.id == cliente_id).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return _build_cliente_ficha(session, cliente)
    finally:
        session.close()


@router.get("/{cliente_id}/ficha/pdf")
def exportar_ficha_cliente_pdf(
    cliente_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        cliente = session.query(Cliente).filter(Cliente.id == cliente_id).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        ficha = _build_cliente_ficha(session, cliente)
        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_ficha_cliente(ficha, config)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="ficha_cliente_{sanitize_filename_component(cliente.nombre, "cliente")}.pdf"'},
        )
    finally:
        session.close()


@router.post("/", response_model=ClienteOut)
def crear_cliente(
    data: ClienteCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        cliente = Cliente(**data.model_dump())
        session.add(cliente)
        session.commit()
        session.refresh(cliente)
        return ClienteOut.model_validate(cliente)
    finally:
        session.close()


@router.put("/{cliente_id}", response_model=ClienteOut)
def editar_cliente(
    cliente_id: int,
    data: ClienteCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        cliente = session.query(Cliente).filter(Cliente.id == cliente_id).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        for key, value in data.model_dump().items():
            setattr(cliente, key, value)
        session.commit()
        session.refresh(cliente)
        return ClienteOut.model_validate(cliente)
    finally:
        session.close()


@prov_router.get("/", response_model=List[ProveedorOut])
def listar_proveedores(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return session.query(Proveedor).order_by(Proveedor.nombre).all()
    finally:
        session.close()


@prov_router.get("/listado-optimizado", response_model=ProveedorListResponseOut)
def listar_proveedores_optimizado(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    buscar: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = _construir_query_proveedores(session, buscar)
        total = query.count()
        total_pages = ceil(total / page_size) if total else 1
        offset = (page - 1) * page_size
        proveedores = query.order_by(Proveedor.nombre.asc()).offset(offset).limit(page_size).all()

        items = [
            ProveedorListItemOut(
                id=proveedor.id,
                nombre=proveedor.nombre,
                telefono=proveedor.telefono,
                email=proveedor.email,
                direccion=proveedor.direccion,
            )
            for proveedor in proveedores
        ]

        return ProveedorListResponseOut(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        )
    finally:
        session.close()


@prov_router.post("/", response_model=ProveedorOut)
def crear_proveedor(
    data: ProveedorCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        proveedor = Proveedor(**data.model_dump())
        session.add(proveedor)
        session.commit()
        session.refresh(proveedor)
        return proveedor
    finally:
        session.close()


@prov_router.get("/{prov_id}/ficha", response_model=ProveedorFichaOut)
def obtener_ficha_proveedor(
    prov_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        proveedor = session.query(Proveedor).filter(Proveedor.id == prov_id).first()
        if not proveedor:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
        return _build_proveedor_ficha(session, proveedor)
    finally:
        session.close()


@prov_router.get("/{prov_id}/ficha/pdf")
def exportar_ficha_proveedor_pdf(
    prov_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        proveedor = session.query(Proveedor).filter(Proveedor.id == prov_id).first()
        if not proveedor:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
        ficha = _build_proveedor_ficha(session, proveedor)
        config = session.query(ConfiguracionEmpresa).first()
        pdf_buffer = generar_pdf_ficha_proveedor(ficha, config)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="ficha_proveedor_{sanitize_filename_component(proveedor.nombre, "proveedor")}.pdf"'},
        )
    finally:
        session.close()


@prov_router.put("/{prov_id}", response_model=ProveedorOut)
def editar_proveedor(
    prov_id: int,
    data: ProveedorCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        proveedor = session.query(Proveedor).filter(Proveedor.id == prov_id).first()
        if not proveedor:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
        for key, value in data.model_dump().items():
            setattr(proveedor, key, value)
        session.commit()
        session.refresh(proveedor)
        return proveedor
    finally:
        session.close()


@ref_router.get("/", response_model=List[ReferidorOut])
def listar_referidores(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return session.query(Referidor).order_by(Referidor.nombre).all()
    finally:
        session.close()


@ref_router.get("/listado-optimizado", response_model=ReferidorListResponseOut)
def listar_referidores_optimizado(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    buscar: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = _construir_query_referidores(session, buscar)
        total = query.count()
        total_pages = ceil(total / page_size) if total else 1
        offset = (page - 1) * page_size
        referidores = query.order_by(Referidor.nombre.asc()).offset(offset).limit(page_size).all()

        items = [
            ReferidorListItemOut(
                id=referidor.id,
                nombre=referidor.nombre,
                telefono=referidor.telefono,
                tipo_comision=referidor.tipo_comision,
                valor_comision=referidor.valor_comision,
                es_porcentaje=referidor.es_porcentaje,
            )
            for referidor in referidores
        ]

        return ReferidorListResponseOut(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        )
    finally:
        session.close()


@ref_router.post("/", response_model=ReferidorOut)
def crear_referidor(
    data: ReferidorCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        payload = data.model_dump()
        if payload["tipo_comision"] == "VARIABLE":
            payload["valor_comision"] = 0.0
            payload["es_porcentaje"] = 0
        elif payload["es_porcentaje"] and payload["valor_comision"] > 100:
            raise HTTPException(status_code=422, detail="El porcentaje de comision no puede ser mayor a 100.")

        referidor = Referidor(**payload)
        session.add(referidor)
        session.commit()
        session.refresh(referidor)
        return referidor
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@ref_router.put("/{referidor_id}", response_model=ReferidorOut)
def editar_referidor(
    referidor_id: int,
    data: ReferidorCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        referidor = session.query(Referidor).filter(Referidor.id == referidor_id).first()
        if not referidor:
            raise HTTPException(status_code=404, detail="Referidor no encontrado.")

        payload = data.model_dump()
        if payload["tipo_comision"] == "VARIABLE":
            payload["valor_comision"] = 0.0
            payload["es_porcentaje"] = 0
        elif payload["es_porcentaje"] and payload["valor_comision"] > 100:
            raise HTTPException(status_code=422, detail="El porcentaje de comision no puede ser mayor a 100.")

        for key, value in payload.items():
            setattr(referidor, key, value)

        session.commit()
        session.refresh(referidor)
        return referidor
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@ref_router.delete("/{referidor_id}")
def eliminar_referidor(
    referidor_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        referidor = session.query(Referidor).filter(Referidor.id == referidor_id).first()
        if not referidor:
            raise HTTPException(status_code=404, detail="Referidor no encontrado.")

        session.delete(referidor)
        session.commit()
        return {"ok": True, "mensaje": "Referidor eliminado exitosamente."}
    except HTTPException:
        session.rollback()
        raise
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="No se puede eliminar el referidor porque tiene clientes asociados.")
    finally:
        session.close()


def _construir_query_vendedores(session, buscar: Optional[str]):
    query = session.query(Vendedor)
    if buscar and buscar.strip():
        term = f"%{buscar.strip()}%"
        query = query.filter(
            or_(
                Vendedor.nombre.ilike(term),
                Vendedor.telefono.ilike(term),
                Vendedor.email.ilike(term),
            )
        )
    return query


def _construir_query_canales(session, buscar: Optional[str]):
    query = session.query(CanalVenta)
    if buscar and buscar.strip():
        term = f"%{buscar.strip()}%"
        query = query.filter(
            or_(
                CanalVenta.nombre.ilike(term),
                CanalVenta.descripcion.ilike(term),
            )
        )
    return query


@vend_router.get("/", response_model=List[VendedorOut])
def listar_vendedores(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    solo_activos: bool = Query(False),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(Vendedor)
        if solo_activos:
            query = query.filter(Vendedor.activo == True)
        return query.order_by(Vendedor.nombre.asc()).all()
    finally:
        session.close()


@vend_router.get("/listado-optimizado", response_model=VendedorListResponseOut)
def listar_vendedores_optimizado(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    buscar: Optional[str] = Query(None),
    solo_activos: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = _construir_query_vendedores(session, buscar)
        if solo_activos:
            query = query.filter(Vendedor.activo == True)
        total = query.count()
        total_pages = ceil(total / page_size) if total else 1
        offset = (page - 1) * page_size
        vendedores = query.order_by(Vendedor.nombre.asc()).offset(offset).limit(page_size).all()
        items = [
            VendedorListItemOut(
                id=vendedor.id,
                nombre=vendedor.nombre,
                telefono=vendedor.telefono,
                email=vendedor.email,
                activo=bool(vendedor.activo),
            )
            for vendedor in vendedores
        ]
        return VendedorListResponseOut(items=items, page=page, page_size=page_size, total=total, total_pages=total_pages)
    finally:
        session.close()


@vend_router.post("/", response_model=VendedorOut)
def crear_vendedor(
    data: VendedorCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        vendedor = Vendedor(**data.model_dump())
        session.add(vendedor)
        session.commit()
        session.refresh(vendedor)
        return vendedor
    finally:
        session.close()


@vend_router.put("/{vendedor_id}", response_model=VendedorOut)
def editar_vendedor(
    vendedor_id: int,
    data: VendedorCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        vendedor = session.query(Vendedor).filter(Vendedor.id == vendedor_id).first()
        if not vendedor:
            raise HTTPException(status_code=404, detail="Vendedor no encontrado.")
        for key, value in data.model_dump().items():
            setattr(vendedor, key, value)
        session.commit()
        session.refresh(vendedor)
        return vendedor
    finally:
        session.close()


@vend_router.delete("/{vendedor_id}")
def eliminar_vendedor(
    vendedor_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        vendedor = session.query(Vendedor).filter(Vendedor.id == vendedor_id).first()
        if not vendedor:
            raise HTTPException(status_code=404, detail="Vendedor no encontrado.")
        session.delete(vendedor)
        session.commit()
        return {"ok": True}
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="No se puede eliminar el vendedor porque ya tiene presupuestos o ventas asociadas.")
    finally:
        session.close()


@canal_router.get("/", response_model=List[CanalVentaOut])
def listar_canales_venta(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    solo_activos: bool = Query(False),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(CanalVenta)
        if solo_activos:
            query = query.filter(CanalVenta.activo == True)
        return query.order_by(CanalVenta.nombre.asc()).all()
    finally:
        session.close()


@canal_router.get("/listado-optimizado", response_model=CanalVentaListResponseOut)
def listar_canales_venta_optimizado(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    buscar: Optional[str] = Query(None),
    solo_activos: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = _construir_query_canales(session, buscar)
        if solo_activos:
            query = query.filter(CanalVenta.activo == True)
        total = query.count()
        total_pages = ceil(total / page_size) if total else 1
        offset = (page - 1) * page_size
        canales = query.order_by(CanalVenta.nombre.asc()).offset(offset).limit(page_size).all()
        items = [
            CanalVentaListItemOut(
                id=canal.id,
                nombre=canal.nombre,
                descripcion=canal.descripcion,
                activo=bool(canal.activo),
            )
            for canal in canales
        ]
        return CanalVentaListResponseOut(items=items, page=page, page_size=page_size, total=total, total_pages=total_pages)
    finally:
        session.close()


@canal_router.post("/", response_model=CanalVentaOut)
def crear_canal_venta(
    data: CanalVentaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        canal = CanalVenta(**data.model_dump())
        session.add(canal)
        session.commit()
        session.refresh(canal)
        return canal
    finally:
        session.close()


@canal_router.put("/{canal_id}", response_model=CanalVentaOut)
def editar_canal_venta(
    canal_id: int,
    data: CanalVentaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        canal = session.query(CanalVenta).filter(CanalVenta.id == canal_id).first()
        if not canal:
            raise HTTPException(status_code=404, detail="Canal no encontrado.")
        for key, value in data.model_dump().items():
            setattr(canal, key, value)
        session.commit()
        session.refresh(canal)
        return canal
    finally:
        session.close()


@canal_router.delete("/{canal_id}")
def eliminar_canal_venta(
    canal_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        canal = session.query(CanalVenta).filter(CanalVenta.id == canal_id).first()
        if not canal:
            raise HTTPException(status_code=404, detail="Canal no encontrado.")
        session.delete(canal)
        session.commit()
        return {"ok": True}
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="No se puede eliminar el canal porque ya tiene presupuestos o ventas asociadas.")
    finally:
        session.close()
