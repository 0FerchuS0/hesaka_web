"""HESAKA Web - Router: Productos y Categorias"""
from math import ceil
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.database import get_session_for_tenant
from app.middleware.tenant import get_tenant_slug
from app.models.models import Atributo, Categoria, Marca, Producto
from app.schemas.schemas import (
    AtributoCreate,
    AtributoOut,
    CategoriaCreate,
    CategoriaOut,
    MarcaCreate,
    MarcaOut,
    ProductoCreate,
    ProductoListItemOut,
    ProductoListResponseOut,
    ProductoOut,
)
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/productos", tags=["Productos"])
cat_router = APIRouter(prefix="/api/categorias", tags=["Categorias"])
attr_router = APIRouter(prefix="/api/atributos", tags=["Atributos"])
marca_router = APIRouter(prefix="/api/marcas", tags=["Marcas"])


def _build_producto_out(producto: Producto) -> ProductoOut:
    producto_out = ProductoOut.model_validate(producto)
    producto_out.categoria_nombre = producto.categoria_rel.nombre if producto.categoria_rel else None
    producto_out.proveedor_nombre = producto.proveedor_rel.nombre if producto.proveedor_rel else None
    producto_out.marca_id = producto.marca_id
    producto_out.marca = producto.marca_rel.nombre if producto.marca_rel else producto.marca
    producto_out.atributos = [AtributoOut.model_validate(attr) for attr in producto.atributos]
    return producto_out


def _build_producto_list_item(producto: Producto) -> ProductoListItemOut:
    return ProductoListItemOut(
        id=producto.id,
        codigo=producto.codigo,
        nombre=producto.nombre,
        codigo_fabricante=producto.codigo_fabricante,
        marca_id=producto.marca_id,
        marca=producto.marca_rel.nombre if producto.marca_rel else producto.marca,
        categoria_id=producto.categoria_id,
        categoria_nombre=producto.categoria_rel.nombre if producto.categoria_rel else None,
        precio_venta=producto.precio_venta,
        costo=producto.costo,
        costo_variable=producto.costo_variable,
        stock_actual=producto.stock_actual,
        impuesto=producto.impuesto,
        activo=producto.activo,
        bajo_pedido=producto.bajo_pedido,
    )


def _construir_query_productos(session, buscar, categoria_id, marca_id, solo_activos):
    query = (
        session.query(Producto)
        .options(
            selectinload(Producto.categoria_rel),
            selectinload(Producto.marca_rel),
        )
    )

    if solo_activos:
        query = query.filter(Producto.activo == True)
    if categoria_id:
        query = query.filter(Producto.categoria_id == categoria_id)
    if marca_id:
        query = query.filter(Producto.marca_id == marca_id)
    if buscar and buscar.strip():
        term = f"%{buscar.strip()}%"
        query = query.filter(
            Producto.nombre.ilike(term)
            | Producto.codigo.ilike(term)
            | Producto.marca.ilike(term)
            | Producto.codigo_fabricante.ilike(term)
        )

    return query


def _generate_codigo_producto(session, categoria_id: int) -> str:
    categoria = (
        session.query(Categoria)
        .filter(Categoria.id == categoria_id)
        .first()
    )
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria no encontrada.")

    productos = (
        session.query(Producto)
        .filter(Producto.categoria_id == categoria_id)
        .all()
    )

    prefix = categoria.prefijo or categoria.nombre[:4]
    prefix_len = len(prefix)
    max_number = 0

    for producto in productos:
        codigo = producto.codigo or ""
        if not codigo.startswith(prefix):
            continue
        try:
            number_part = int(codigo[prefix_len:])
        except ValueError:
            continue
        max_number = max(max_number, number_part)

    return f"{prefix}{max_number + 1:05d}"


def _serialize_atributos_categoria(session, categoria: Categoria) -> dict:
    heredados = []
    if categoria.categoria_padre:
        heredados = list(categoria.categoria_padre.atributos_disponibles)

    heredados_ids = {attr.id for attr in heredados}
    propios = [attr for attr in categoria.atributos_disponibles if attr.id not in heredados_ids]

    return {
        "categoria_id": categoria.id,
        "categoria_nombre": categoria.nombre,
        "categoria_padre_id": categoria.categoria_padre_id,
        "codigo_sugerido": _generate_codigo_producto(session, categoria.id),
        "atributos_heredados": [AtributoOut.model_validate(attr).model_dump() for attr in heredados],
        "atributos_propios": [AtributoOut.model_validate(attr).model_dump() for attr in propios],
    }


def _get_categoria_or_404(session, categoria_id: int) -> Categoria:
    categoria = (
        session.query(Categoria)
        .options(
            selectinload(Categoria.categoria_padre).selectinload(Categoria.atributos_disponibles),
            selectinload(Categoria.atributos_disponibles),
        )
        .filter(Categoria.id == categoria_id)
        .first()
    )
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria no encontrada.")
    return categoria


def _get_atributo_or_404(session, atributo_id: int) -> Atributo:
    atributo = session.query(Atributo).filter(Atributo.id == atributo_id).first()
    if not atributo:
        raise HTTPException(status_code=404, detail="Atributo no encontrado.")
    return atributo


def _get_marca_or_404(session, marca_id: int) -> Marca:
    marca = session.query(Marca).filter(Marca.id == marca_id).first()
    if not marca:
        raise HTTPException(status_code=404, detail="Marca no encontrada.")
    return marca


@marca_router.get("/", response_model=List[MarcaOut])
def listar_marcas_catalogo(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return session.query(Marca).order_by(Marca.nombre).all()
    finally:
        session.close()


@marca_router.post("/", response_model=MarcaOut)
def crear_marca(
    data: MarcaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        marca = Marca(nombre=data.nombre)
        session.add(marca)
        session.commit()
        session.refresh(marca)
        return marca
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una marca con ese nombre.")
    finally:
        session.close()


@marca_router.put("/{marca_id}", response_model=MarcaOut)
def editar_marca(
    marca_id: int,
    data: MarcaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        marca = _get_marca_or_404(session, marca_id)
        marca.nombre = data.nombre

        productos = session.query(Producto).filter(Producto.marca_id == marca_id).all()
        for producto in productos:
            producto.marca = data.nombre

        session.commit()
        session.refresh(marca)
        return marca
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una marca con ese nombre.")
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@marca_router.delete("/{marca_id}")
def eliminar_marca(
    marca_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        marca = _get_marca_or_404(session, marca_id)
        tiene_productos = session.query(Producto).filter(Producto.marca_id == marca_id).first()
        if tiene_productos:
            raise HTTPException(status_code=409, detail="No se puede eliminar una marca con productos asociados.")

        session.delete(marca)
        session.commit()
        return {"ok": True, "mensaje": "Marca eliminada exitosamente."}
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@attr_router.get("/", response_model=List[AtributoOut])
def listar_atributos(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return session.query(Atributo).order_by(Atributo.nombre).all()
    finally:
        session.close()


@attr_router.post("/", response_model=AtributoOut)
def crear_atributo(
    data: AtributoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        atributo = Atributo(nombre=data.nombre)
        session.add(atributo)
        session.commit()
        session.refresh(atributo)
        return atributo
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Ya existe un atributo con ese nombre.")
    finally:
        session.close()


@cat_router.post("/{categoria_id}/atributos", response_model=AtributoOut)
def agregar_atributo_a_categoria(
    categoria_id: int,
    data: AtributoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        categoria = _get_categoria_or_404(session, categoria_id)
        atributo = session.query(Atributo).filter(Atributo.nombre == data.nombre).first()
        if not atributo:
            atributo = Atributo(nombre=data.nombre)
            session.add(atributo)
            session.flush()

        if atributo in categoria.atributos_disponibles:
            raise HTTPException(status_code=409, detail="El atributo ya esta asignado a esta categoria.")

        categoria.atributos_disponibles.append(atributo)
        session.commit()
        session.refresh(atributo)
        return atributo
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="No se pudo asignar el atributo a la categoria.")
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@cat_router.post("/{categoria_id}/atributos/{atributo_id}", response_model=AtributoOut)
def vincular_atributo_existente_a_categoria(
    categoria_id: int,
    atributo_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        categoria = _get_categoria_or_404(session, categoria_id)
        atributo = _get_atributo_or_404(session, atributo_id)
        if atributo in categoria.atributos_disponibles:
            raise HTTPException(status_code=409, detail="El atributo ya esta asignado a esta categoria.")

        categoria.atributos_disponibles.append(atributo)
        session.commit()
        session.refresh(atributo)
        return atributo
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@cat_router.delete("/{categoria_id}/atributos/{atributo_id}")
def quitar_atributo_de_categoria(
    categoria_id: int,
    atributo_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        categoria = _get_categoria_or_404(session, categoria_id)
        atributo = _get_atributo_or_404(session, atributo_id)
        if atributo not in categoria.atributos_disponibles:
            raise HTTPException(status_code=404, detail="El atributo no esta asignado a esta categoria.")

        categoria.atributos_disponibles.remove(atributo)
        session.commit()
        return {"ok": True, "mensaje": "Atributo removido de la categoria."}
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@cat_router.get("/", response_model=List[CategoriaOut])
def listar_categorias(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return session.query(Categoria).order_by(Categoria.nombre).all()
    finally:
        session.close()


@cat_router.get("/{categoria_id}/atributos")
def obtener_atributos_categoria(
    categoria_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        categoria = _get_categoria_or_404(session, categoria_id)
        return _serialize_atributos_categoria(session, categoria)
    finally:
        session.close()


@cat_router.post("/", response_model=CategoriaOut)
def crear_categoria(
    data: CategoriaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        payload = data.model_dump()
        payload["prefijo"] = payload["nombre"][:4]

        if payload["categoria_padre_id"] is not None:
            padre = session.query(Categoria).filter(Categoria.id == payload["categoria_padre_id"]).first()
            if not padre:
                raise HTTPException(status_code=404, detail="Categoria padre no encontrada.")

        categoria = Categoria(**payload)
        session.add(categoria)
        session.commit()
        session.refresh(categoria)
        return categoria
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una categoria con ese nombre.")
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@cat_router.put("/{categoria_id}", response_model=CategoriaOut)
def editar_categoria(
    categoria_id: int,
    data: CategoriaCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        categoria = session.query(Categoria).filter(Categoria.id == categoria_id).first()
        if not categoria:
            raise HTTPException(status_code=404, detail="Categoria no encontrada.")

        payload = data.model_dump()
        payload["prefijo"] = payload["nombre"][:4]

        if payload["categoria_padre_id"] is not None:
            if payload["categoria_padre_id"] == categoria_id:
                raise HTTPException(status_code=422, detail="Una categoria no puede ser subcategoria de si misma.")

            padre_temp = session.query(Categoria).filter(Categoria.id == payload["categoria_padre_id"]).first()
            if not padre_temp:
                raise HTTPException(status_code=404, detail="Categoria padre no encontrada.")

            while padre_temp:
                if padre_temp.id == categoria_id:
                    raise HTTPException(status_code=422, detail="La relacion padre/hijo generaria una referencia circular.")
                padre_temp = padre_temp.categoria_padre

        for key, value in payload.items():
            setattr(categoria, key, value)

        session.commit()
        session.refresh(categoria)
        return categoria
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una categoria con ese nombre.")
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@cat_router.delete("/{categoria_id}")
def eliminar_categoria(
    categoria_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        categoria = session.query(Categoria).filter(Categoria.id == categoria_id).first()
        if not categoria:
            raise HTTPException(status_code=404, detail="Categoria no encontrada.")

        tiene_subcategorias = session.query(Categoria).filter(Categoria.categoria_padre_id == categoria_id).first()
        if tiene_subcategorias:
            raise HTTPException(status_code=409, detail="No se puede eliminar una categoria que tiene subcategorias.")

        session.delete(categoria)
        session.commit()
        return {"ok": True, "mensaje": "Categoria eliminada exitosamente."}
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="No se puede eliminar la categoria porque tiene productos asociados.")
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/", response_model=List[ProductoOut])
def listar_productos(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    buscar: Optional[str] = Query(None),
    categoria_id: Optional[int] = Query(None),
    marca_id: Optional[int] = Query(None),
    marca: Optional[str] = Query(None),
    solo_activos: bool = Query(True),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = (
            session.query(Producto)
            .options(
                selectinload(Producto.categoria_rel),
                selectinload(Producto.marca_rel),
                selectinload(Producto.proveedor_rel),
                selectinload(Producto.atributos),
            )
        )

        if solo_activos:
            query = query.filter(Producto.activo == True)
        if categoria_id:
            query = query.filter(Producto.categoria_id == categoria_id)
        if marca_id:
            query = query.filter(Producto.marca_id == marca_id)
        elif marca:
            query = query.filter(func.upper(Producto.marca) == marca.strip().upper())
        if buscar:
            query = query.filter(
                Producto.nombre.ilike(f"%{buscar}%")
                | Producto.codigo.ilike(f"%{buscar}%")
                | Producto.marca.ilike(f"%{buscar}%")
            )

        productos = query.order_by(Producto.nombre).all()
        return [_build_producto_out(producto) for producto in productos]
    finally:
        session.close()


@router.get("/listado-optimizado", response_model=ProductoListResponseOut)
def listar_productos_optimizado(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
    buscar: Optional[str] = Query(None),
    categoria_id: Optional[int] = Query(None),
    marca_id: Optional[int] = Query(None),
    solo_activos: bool = Query(True),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = _construir_query_productos(session, buscar, categoria_id, marca_id, solo_activos)
        total = query.count()
        total_pages = ceil(total / page_size) if total else 1
        offset = (page - 1) * page_size
        productos = query.order_by(Producto.nombre.asc()).offset(offset).limit(page_size).all()

        return ProductoListResponseOut(
            items=[_build_producto_list_item(producto) for producto in productos],
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        )
    finally:
        session.close()


@router.get("/marcas")
def listar_marcas(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return [marca.nombre for marca in session.query(Marca).order_by(Marca.nombre).all()]
    finally:
        session.close()


@router.get("/codigo-sugerido/{categoria_id}")
def obtener_codigo_sugerido(
    categoria_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return {"codigo": _generate_codigo_producto(session, categoria_id)}
    finally:
        session.close()


@router.get("/{producto_id}", response_model=ProductoOut)
def obtener_producto(
    producto_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        producto = (
            session.query(Producto)
            .options(
                selectinload(Producto.categoria_rel),
                selectinload(Producto.marca_rel),
                selectinload(Producto.proveedor_rel),
                selectinload(Producto.atributos),
            )
            .filter(Producto.id == producto_id)
            .first()
        )
        if not producto:
            raise HTTPException(status_code=404, detail="Producto no encontrado.")
        return _build_producto_out(producto)
    finally:
        session.close()


@router.post("/", response_model=ProductoOut)
def crear_producto(
    data: ProductoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        _get_categoria_or_404(session, data.categoria_id)
        payload = data.model_dump(exclude={"atributos_ids", "codigo"})
        payload["codigo"] = _generate_codigo_producto(session, data.categoria_id)
        if data.costo_variable:
            payload["costo"] = 0.0
        if data.marca_id:
            marca = _get_marca_or_404(session, data.marca_id)
            payload["marca_id"] = marca.id
            payload["marca"] = marca.nombre
        else:
            payload["marca_id"] = None
            payload["marca"] = data.marca

        producto = Producto(**payload)
        session.add(producto)
        session.flush()

        if data.atributos_ids:
            atributos = session.query(Atributo).filter(Atributo.id.in_(data.atributos_ids)).all()
            producto.atributos = atributos

        session.commit()
        session.refresh(producto)
        return _build_producto_out(producto)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="No se pudo guardar el producto por un conflicto de codigo o datos duplicados.")
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.put("/{producto_id}", response_model=ProductoOut)
def editar_producto(
    producto_id: int,
    data: ProductoCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        producto = (
            session.query(Producto)
            .options(selectinload(Producto.atributos))
            .filter(Producto.id == producto_id)
            .first()
        )
        if not producto:
            raise HTTPException(status_code=404, detail="Producto no encontrado.")

        _get_categoria_or_404(session, data.categoria_id)
        payload = data.model_dump(exclude={"atributos_ids", "codigo"})
        if data.costo_variable:
            payload["costo"] = 0.0
        if data.marca_id:
            marca = _get_marca_or_404(session, data.marca_id)
            payload["marca_id"] = marca.id
            payload["marca"] = marca.nombre
        else:
            payload["marca_id"] = None
            payload["marca"] = data.marca

        for key, value in payload.items():
            setattr(producto, key, value)

        if data.atributos_ids is not None:
            atributos = session.query(Atributo).filter(Atributo.id.in_(data.atributos_ids)).all() if data.atributos_ids else []
            producto.atributos = atributos

        session.commit()
        session.refresh(producto)
        return _build_producto_out(producto)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="No se pudo actualizar el producto por un conflicto de datos.")
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


@router.delete("/{producto_id}")
def desactivar_producto(
    producto_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(get_current_user),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        producto = session.query(Producto).filter(Producto.id == producto_id).first()
        if not producto:
            raise HTTPException(status_code=404, detail="Producto no encontrado.")
        producto.activo = False
        session.commit()
        return {"ok": True, "mensaje": "Producto desactivado."}
    finally:
        session.close()
