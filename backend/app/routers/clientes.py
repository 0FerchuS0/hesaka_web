"""HESAKA Web - Router: Clientes, Proveedores, Referidores"""
from datetime import datetime
from math import ceil
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.database import get_session_for_tenant
from app.middleware.tenant import get_tenant_slug
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
    Venta,
)
from app.schemas.schemas import (
    ClienteCreate,
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
)
from app.utils.auth import get_current_user
from app.utils.excel_reporte_clientes import generar_excel_reporte_clientes
from app.utils.pdf_fichas import generar_pdf_ficha_cliente, generar_pdf_ficha_proveedor
from app.utils.pdf_reporte_clientes import generar_pdf_reporte_clientes

router = APIRouter(prefix="/api/clientes", tags=["Clientes"])
prov_router = APIRouter(prefix="/api/proveedores", tags=["Proveedores"])
ref_router = APIRouter(prefix="/api/referidores", tags=["Referidores"])


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

    ultima_grad = (
        session.query(Presupuesto)
        .filter(
            Presupuesto.cliente_id == cliente.id,
            Presupuesto.graduacion_od_esfera.isnot(None),
        )
        .order_by(Presupuesto.fecha.desc(), Presupuesto.id.desc())
        .first()
    )

    ultima_graduacion = None
    if ultima_grad:
        ultima_graduacion = GraduacionClienteFichaOut(
            presupuesto_id=ultima_grad.id,
            codigo_presupuesto=ultima_grad.codigo,
            fecha_presupuesto=ultima_grad.fecha,
            fecha_receta=ultima_grad.fecha_receta,
            doctor=ultima_grad.doctor_receta,
            observaciones=ultima_grad.observaciones,
            od_esfera=ultima_grad.graduacion_od_esfera,
            od_cilindro=ultima_grad.graduacion_od_cilindro,
            od_eje=ultima_grad.graduacion_od_eje,
            od_adicion=ultima_grad.graduacion_od_adicion,
            oi_esfera=ultima_grad.graduacion_oi_esfera,
            oi_cilindro=ultima_grad.graduacion_oi_cilindro,
            oi_eje=ultima_grad.graduacion_oi_eje,
            oi_adicion=ultima_grad.graduacion_oi_adicion,
        )

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
            headers={"Content-Disposition": 'inline; filename="reporte_clientes.pdf"'},
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
            headers={"Content-Disposition": f'inline; filename="ficha_cliente_{cliente_id}.pdf"'},
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
            headers={"Content-Disposition": f'inline; filename="ficha_proveedor_{prov_id}.pdf"'},
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
