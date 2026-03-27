"""
HESAKA Web — Schemas Pydantic
Modelos de request/response para la API REST.
Separados de los modelos SQLAlchemy para mejor control.
"""
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import date, datetime


# ──────────────────────────────────────────────
# AUTH
# ──────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario_id: int
    nombre_completo: str
    rol: str
    permisos: List[str] = []
    tenant_slug: str

class UsuarioCreate(BaseModel):
    email: EmailStr
    password: str
    nombre_completo: str
    rol: str = "OPERADOR"

class UsuarioOut(BaseModel):
    id: int
    email: EmailStr
    nombre_completo: str
    rol: str
    permisos: List[str] = []
    activo: bool
    creado_en: datetime
    ultimo_acceso: Optional[datetime] = None
    class Config:
        from_attributes = True


class UsuarioPasswordReset(BaseModel):
    password: str


class UsuarioEstadoUpdate(BaseModel):
    activo: bool


class UsuarioPermisosUpdate(BaseModel):
    permisos: List[str] = []


# ──────────────────────────────────────────────
# CONFIGURACION GENERAL
# ──────────────────────────────────────────────

class ConfiguracionGeneralUpdate(BaseModel):
    nombre: str
    ruc: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[EmailStr] = None
    logo_path: Optional[str] = None

    @field_validator("nombre")
    @classmethod
    def validar_nombre_configuracion(cls, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise ValueError("El nombre de la optica es obligatorio")
        return value

    @field_validator("ruc", "direccion", "telefono", "logo_path")
    @classmethod
    def limpiar_texto_configuracion(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value else None


class ConfiguracionGeneralOut(BaseModel):
    id: int
    nombre: str
    ruc: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[EmailStr] = None
    logo_path: Optional[str] = None
    canal_principal_nombre: Optional[str] = None
    configuracion_completa: bool = False

    class Config:
        from_attributes = True


class ConfiguracionGeneralEstadoOut(BaseModel):
    configuracion_completa: bool
    nombre_negocio: Optional[str] = None
    canal_principal_nombre: Optional[str] = None


class ConfiguracionGeneralPublicaOut(BaseModel):
    nombre: str
    logo_path: Optional[str] = None
    canal_principal_nombre: Optional[str] = None


class BackupItemOut(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime


class BackupListOut(BaseModel):
    items: List[BackupItemOut]


class BackupCreateOut(BaseModel):
    message: str
    backup: BackupItemOut


class BackupRestoreIn(BaseModel):
    confirm_filename: str


class BackupRestoreOut(BaseModel):
    message: str
    backup: BackupItemOut


# ──────────────────────────────────────────────
# CATEGORÍAS & ATRIBUTOS
# ──────────────────────────────────────────────

class CategoriaOut(BaseModel):
    id: int
    nombre: str
    prefijo: str
    descripcion: Optional[str]
    categoria_padre_id: Optional[int]
    class Config:
        from_attributes = True

class CategoriaCreate(BaseModel):
    nombre: str
    prefijo: str
    descripcion: Optional[str] = None
    categoria_padre_id: Optional[int] = None

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("nombre es obligatorio")
        return value

    @field_validator("prefijo")
    @classmethod
    def normalizar_prefijo(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("prefijo es obligatorio")
        return value[:4]

    @field_validator("descripcion")
    @classmethod
    def normalizar_descripcion(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value else value

class AtributoOut(BaseModel):
    id: int
    nombre: str
    class Config:
        from_attributes = True


class AtributoCreate(BaseModel):
    nombre: str

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre_atributo(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("nombre es obligatorio")
        return value


class MarcaOut(BaseModel):
    id: int
    nombre: str
    class Config:
        from_attributes = True


class MarcaCreate(BaseModel):
    nombre: str

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre_marca(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("nombre es obligatorio")
        return value


# ──────────────────────────────────────────────
# PRODUCTOS
# ──────────────────────────────────────────────

class ProductoOut(BaseModel):
    id: int
    codigo: str
    nombre: str
    codigo_fabricante: Optional[str]
    marca_id: Optional[int] = None
    marca: Optional[str] = None
    categoria_id: Optional[int] = None
    categoria_nombre: Optional[str] = None
    proveedor_id: Optional[int]
    proveedor_nombre: Optional[str] = None
    precio_venta: float
    costo: Optional[float]
    costo_variable: bool
    stock_actual: Optional[int] = 0
    impuesto: Optional[int] = 10
    descripcion: Optional[str]
    activo: bool
    bajo_pedido: bool
    atributos: List[AtributoOut] = []
    class Config:
        from_attributes = True


class ProductoListItemOut(BaseModel):
    id: int
    codigo: str
    nombre: str
    codigo_fabricante: Optional[str] = None
    marca_id: Optional[int] = None
    marca: Optional[str] = None
    categoria_id: Optional[int] = None
    categoria_nombre: Optional[str] = None
    precio_venta: float
    costo: Optional[float] = None
    costo_variable: bool
    stock_actual: Optional[int] = 0
    impuesto: Optional[int] = 10
    activo: bool
    bajo_pedido: bool


class ProductoListResponseOut(BaseModel):
    items: List[ProductoListItemOut]
    page: int
    page_size: int
    total: int
    total_pages: int

class ProductoCreate(BaseModel):
    codigo: Optional[str] = None
    nombre: str
    codigo_fabricante: Optional[str] = None
    marca_id: Optional[int] = None
    marca: Optional[str] = None
    categoria_id: int
    proveedor_id: Optional[int] = None
    precio_venta: float
    costo: Optional[float] = None
    costo_variable: bool = False
    stock_actual: int = 0
    impuesto: int = 10
    descripcion: Optional[str] = None
    activo: bool = True
    bajo_pedido: bool = False
    atributos_ids: List[int] = []

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre_producto(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("nombre es obligatorio")
        return value

    @field_validator("codigo_fabricante")
    @classmethod
    def normalizar_codigo_fabricante(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value else value

    @field_validator("marca")
    @classmethod
    def normalizar_marca(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value else value

    @field_validator("descripcion")
    @classmethod
    def normalizar_descripcion_producto(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value else value


# ──────────────────────────────────────────────
# CLIENTES
# ──────────────────────────────────────────────

class ClienteOut(BaseModel):
    id: int
    nombre: str
    ci: Optional[str]
    telefono: Optional[str]
    email: Optional[str]
    direccion: Optional[str]
    fecha_registro: Optional[datetime]
    notas: Optional[str]
    referidor_id: Optional[int]
    referidor_nombre: Optional[str] = None
    class Config:
        from_attributes = True


class ClienteListItemOut(BaseModel):
    id: int
    nombre: str
    ci: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    fecha_registro: Optional[datetime] = None
    notas: Optional[str] = None
    referidor_id: Optional[int] = None
    referidor_nombre: Optional[str] = None


class ClienteListResponseOut(BaseModel):
    items: List[ClienteListItemOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class ClienteCreate(BaseModel):
    nombre: str
    ci: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    notas: Optional[str] = None
    referidor_id: Optional[int] = None


# ──────────────────────────────────────────────
# PROVEEDORES
# ──────────────────────────────────────────────

class ProveedorOut(BaseModel):
    id: int
    nombre: str
    telefono: Optional[str]
    email: Optional[str]
    direccion: Optional[str]
    class Config:
        from_attributes = True


class ProveedorListItemOut(BaseModel):
    id: int
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None


class ProveedorListResponseOut(BaseModel):
    items: List[ProveedorListItemOut]
    page: int
    page_size: int
    total: int
    total_pages: int

class ProveedorCreate(BaseModel):
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None


# ──────────────────────────────────────────────
# REFERIDORES
# ──────────────────────────────────────────────

class ReferidorOut(BaseModel):
    id: int
    nombre: str
    telefono: Optional[str]
    tipo_comision: str
    valor_comision: float
    es_porcentaje: int
    class Config:
        from_attributes = True


class ReferidorListItemOut(BaseModel):
    id: int
    nombre: str
    telefono: Optional[str] = None
    tipo_comision: str
    valor_comision: float
    es_porcentaje: int


class ReferidorListResponseOut(BaseModel):
    items: List[ReferidorListItemOut]
    page: int
    page_size: int
    total: int
    total_pages: int

class ReferidorCreate(BaseModel):
    nombre: str
    telefono: Optional[str] = None
    tipo_comision: str = "FIJA"
    valor_comision: float = 0.0
    es_porcentaje: int = 0

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("tipo_comision")
    @classmethod
    def validar_tipo_comision(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"FIJA", "VARIABLE"}:
            raise ValueError("tipo_comision debe ser FIJA o VARIABLE")
        return value

    @field_validator("valor_comision")
    @classmethod
    def validar_valor_comision(cls, value: float) -> float:
        if value < 0:
            raise ValueError("valor_comision no puede ser negativo")
        return value

    @field_validator("es_porcentaje")
    @classmethod
    def validar_es_porcentaje(cls, value: int) -> int:
        if value not in (0, 1):
            raise ValueError("es_porcentaje debe ser 0 o 1")
        return value


class VendedorOut(BaseModel):
    id: int
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None
    activo: bool = True

    class Config:
        from_attributes = True


class VendedorListItemOut(BaseModel):
    id: int
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    activo: bool = True


class VendedorListResponseOut(BaseModel):
    items: List[VendedorListItemOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class VendedorCreate(BaseModel):
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None
    activo: bool = True

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre_vendedor(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("nombre es obligatorio")
        return value


class CanalVentaOut(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    activo: bool = True

    class Config:
        from_attributes = True


class CanalVentaListItemOut(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    activo: bool = True


class CanalVentaListResponseOut(BaseModel):
    items: List[CanalVentaListItemOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class CanalVentaCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    activo: bool = True

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre_canal(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("nombre es obligatorio")
        return value


# ──────────────────────────────────────────────
# PRESUPUESTOS
# ──────────────────────────────────────────────

class PresupuestoItemCreate(BaseModel):
    id: Optional[int] = None
    producto_id: int
    cantidad: int = 1
    precio_unitario: float
    costo_unitario: float = 0.0
    descuento: float = 0.0
    subtotal: float
    descripcion_personalizada: Optional[str] = None
    codigo_armazon: Optional[str] = None
    medidas_armazon: Optional[str] = None

class PresupuestoItemOut(BaseModel):
    id: int
    producto_id: int
    producto_nombre: Optional[str] = None
    cantidad: int
    precio_unitario: float
    costo_unitario: float
    descuento: float
    subtotal: float
    descripcion_personalizada: Optional[str]
    codigo_armazon: Optional[str]
    medidas_armazon: Optional[str]
    class Config:
        from_attributes = True

class PresupuestoCreate(BaseModel):
    cliente_id: int
    fecha: Optional[datetime] = None
    estado: str = 'PENDIENTE'
    graduacion_od_esfera: Optional[str] = None
    graduacion_od_cilindro: Optional[str] = None
    graduacion_od_eje: Optional[str] = None
    graduacion_od_adicion: Optional[str] = None
    graduacion_oi_esfera: Optional[str] = None
    graduacion_oi_cilindro: Optional[str] = None
    graduacion_oi_eje: Optional[str] = None
    graduacion_oi_adicion: Optional[str] = None
    doctor_receta: Optional[str] = None
    observaciones: Optional[str] = None
    fecha_receta: Optional[datetime] = None
    vendedor_id: Optional[int] = None
    canal_venta_id: Optional[int] = None
    referidor_id: Optional[int] = None
    comision_monto: float = 0.0
    items: List[PresupuestoItemCreate]

class PresupuestoOut(BaseModel):
    id: int
    codigo: str
    fecha: datetime
    estado: str
    cliente_id: int
    cliente_nombre: Optional[str] = None
    total: float
    graduacion_od_esfera: Optional[str]
    graduacion_od_cilindro: Optional[str]
    graduacion_od_eje: Optional[str]
    graduacion_od_adicion: Optional[str]
    graduacion_oi_esfera: Optional[str]
    graduacion_oi_cilindro: Optional[str]
    graduacion_oi_eje: Optional[str]
    graduacion_oi_adicion: Optional[str]
    doctor_receta: Optional[str]
    observaciones: Optional[str]
    vendedor_id: Optional[int]
    vendedor_nombre: Optional[str] = None
    canal_venta_id: Optional[int]
    canal_venta_nombre: Optional[str] = None
    referidor_id: Optional[int]
    referidor_nombre: Optional[str] = None
    comision_monto: float
    items: List[PresupuestoItemOut] = []
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# VENTAS
# ──────────────────────────────────────────────

class PagoCreate(BaseModel):
    monto: float
    metodo_pago: str  # EFECTIVO, TARJETA, TRANSFERENCIA, CHEQUE
    banco_id: Optional[int] = None
    nota: Optional[str] = None
    fecha: Optional[datetime] = None

class PagoOut(BaseModel):
    id: int
    fecha: Optional[datetime] = None
    monto: float = 0.0
    metodo_pago: Optional[str] = "EFECTIVO"
    banco_id: Optional[int] = None
    nota: Optional[str] = None
    grupo_pago_id: Optional[str] = None
    class Config:
        from_attributes = True

class PagoMultipleItem(BaseModel):
    venta_id: int
    monto: float

class PagoMultipleCreate(BaseModel):
    items: List[PagoMultipleItem]
    metodo_pago: str
    banco_id: Optional[int] = None
    nota: Optional[str] = None
    fecha: Optional[datetime] = None

class GrupoPagoOut(BaseModel):
    grupo_id: str
    fecha: Optional[datetime] = None
    total: float = 0.0
    cant_pagos: int = 0
    metodo: Optional[str] = "N/A"
    nota: Optional[str] = ""
    clientes_str: Optional[str] = ""
    class Config:
        from_attributes = True

class VentaCreate(BaseModel):
    cliente_id: int
    presupuesto_id: Optional[int] = None
    total: float
    vendedor_id: Optional[int] = None
    canal_venta_id: Optional[int] = None
    referidor_id: Optional[int] = None
    comision_monto: float = 0.0
    requiere_compra: bool = True
    es_credito: bool = False
    pagos: List[PagoCreate] = []

class VentaOut(BaseModel):
    id: int
    codigo: Optional[str] = "N/A"
    fecha: Optional[datetime] = None
    cliente_id: Optional[int] = None
    cliente_nombre: Optional[str] = None
    presupuesto_id: Optional[int] = None
    total: float = 0.0
    saldo: float = 0.0
    estado: str = "PENDIENTE"
    estado_entrega: Optional[str] = None
    es_credito: bool = False
    vendedor_id: Optional[int] = None
    vendedor_nombre: Optional[str] = None
    canal_venta_id: Optional[int] = None
    canal_venta_nombre: Optional[str] = None
    referidor_id: Optional[int] = None
    comision_monto: float = 0.0
    pagos: List[PagoOut] = []
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# COMPRAS
# ──────────────────────────────────────────────

class CompraDetalleCreate(BaseModel):
    descripcion: str
    cantidad: int = 1
    costo_unitario: float
    iva: int = 10
    descuento: float = 0.0
    subtotal: float
    producto_id: Optional[int] = None
    presupuesto_item_id: Optional[int] = None

class CompraDetalleOut(BaseModel):
    id: int
    descripcion: str
    cantidad: int
    costo_unitario: float
    iva: int
    descuento: float
    subtotal: float
    producto_id: Optional[int] = None
    presupuesto_item_id: Optional[int] = None
    class Config:
        from_attributes = True


class PresupuestoListItemOut(BaseModel):
    id: int
    codigo: str
    fecha: datetime
    estado: str
    cliente_id: int
    cliente_nombre: Optional[str] = None
    total: float
    graduacion_od_esfera: Optional[str] = None
    graduacion_od_cilindro: Optional[str] = None
    graduacion_od_eje: Optional[str] = None
    graduacion_oi_esfera: Optional[str] = None
    graduacion_oi_cilindro: Optional[str] = None
    graduacion_oi_eje: Optional[str] = None
    vendedor_id: Optional[int] = None
    vendedor_nombre: Optional[str] = None
    canal_venta_id: Optional[int] = None
    canal_venta_nombre: Optional[str] = None
    referidor_id: Optional[int] = None
    referidor_nombre: Optional[str] = None
    comision_monto: float = 0.0


class PresupuestoListResponseOut(BaseModel):
    items: List[PresupuestoListItemOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class PresupuestoAsignacionComercialIn(BaseModel):
    vendedor_id: Optional[int] = None
    canal_venta_id: Optional[int] = None


class VentaListItemOut(BaseModel):
    id: int
    codigo: Optional[str] = "N/A"
    fecha: Optional[datetime] = None
    cliente_id: Optional[int] = None
    cliente_nombre: Optional[str] = None
    vendedor_nombre: Optional[str] = None
    canal_venta_nombre: Optional[str] = None
    total: float = 0.0
    saldo: float = 0.0
    estado: str = "PENDIENTE"
    estado_entrega: Optional[str] = None


class VentaListResponseOut(BaseModel):
    items: List[VentaListItemOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class AjusteVentaCreate(BaseModel):
    venta_id: int
    monto: float
    motivo: str
    tipo: str = "AJUSTE"

    @field_validator("motivo")
    @classmethod
    def normalizar_motivo_ajuste(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("motivo es obligatorio")
        return value

    @field_validator("tipo")
    @classmethod
    def validar_tipo_ajuste(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"DESCUENTO", "NOTA_CREDITO", "AJUSTE"}:
            raise ValueError("tipo invalido")
        return value


class AjusteVentaUpdate(BaseModel):
    monto: float
    motivo: str
    tipo: str

    @field_validator("motivo")
    @classmethod
    def normalizar_motivo_ajuste_update(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("motivo es obligatorio")
        return value

    @field_validator("tipo")
    @classmethod
    def validar_tipo_ajuste_update(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"DESCUENTO", "NOTA_CREDITO", "AJUSTE"}:
            raise ValueError("tipo invalido")
        return value


class AjusteVentaOut(BaseModel):
    id: int
    venta_id: int
    venta_codigo: str
    fecha: datetime
    cliente_id: Optional[int] = None
    cliente_nombre: str
    tipo: str
    monto: float
    motivo: str
    usuario: Optional[str] = None


class AjusteVentaListResponseOut(BaseModel):
    items: List[AjusteVentaOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class VentasPdfMultipleRequest(BaseModel):
    venta_ids: List[int]

class CompraCreate(BaseModel):
    proveedor_id: Optional[int] = None
    tipo_documento: str  # FACTURA, ORDEN_SERVICIO
    nro_factura: Optional[str] = None
    total: float
    condicion_pago: str = "CONTADO"
    fecha_vencimiento: Optional[datetime] = None
    observaciones: Optional[str] = None
    estado_entrega: str = "RECIBIDO"
    tipo_compra: str = "ORIGINAL"
    ventas_ids: List[int] = []
    items: List[CompraDetalleCreate]

class CompraOut(BaseModel):
    id: int
    fecha: datetime
    proveedor_id: Optional[int]
    proveedor_nombre: Optional[str] = None
    tipo_documento: str
    nro_factura: Optional[str]
    tipo_documento_original: Optional[str] = None
    nro_documento_original: Optional[str] = None
    total: float
    saldo: float
    estado: str
    estado_entrega: str
    condicion_pago: str
    tipo_compra: str = "ORIGINAL"
    observaciones: Optional[str] = None
    fecha_vencimiento: Optional[datetime] = None
    ventas_ids: List[int] = []
    ventas_codigos: List[str] = []
    clientes_nombres: List[str] = []
    items: List[CompraDetalleOut] = []
    class Config:
        from_attributes = True


class CompraListItemOut(BaseModel):
    id: int
    fecha: datetime
    proveedor_id: Optional[int]
    proveedor_nombre: Optional[str] = None
    tipo_documento: str
    nro_factura: Optional[str]
    tipo_documento_original: Optional[str] = None
    nro_documento_original: Optional[str] = None
    total: float
    saldo: float
    estado: str
    estado_entrega: str
    condicion_pago: str
    tipo_compra: str = "ORIGINAL"
    clientes_nombres: List[str] = []
    ventas_codigos: List[str] = []


class CompraListResponseOut(BaseModel):
    items: List[CompraListItemOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class PagoCompraCreate(BaseModel):
    monto: float
    metodo_pago: str = "EFECTIVO"
    banco_id: Optional[int] = None
    nro_comprobante: Optional[str] = None
    fecha: Optional[datetime] = None


class PagoCompraOut(BaseModel):
    id: int
    compra_id: int
    fecha: datetime
    monto: float
    metodo_pago: str
    banco_id: Optional[int] = None
    banco_nombre: Optional[str] = None
    nro_comprobante: Optional[str] = None
    estado: str
    class Config:
        from_attributes = True


class CuentaPorPagarProveedorResumenOut(BaseModel):
    proveedor_id: int
    proveedor_nombre: str
    cantidad_documentos: int
    vencidas: int = 0
    sin_vencimiento: int = 0
    total_deuda: float = 0.0
    total_vencido: float = 0.0
    total_sin_vencimiento: float = 0.0
    total_os: float = 0.0


class CuentaPorPagarDocumentoOut(BaseModel):
    compra_id: int
    fecha: datetime
    proveedor_id: Optional[int] = None
    proveedor_nombre: Optional[str] = None
    condicion_pago: str
    tipo_documento: str
    nro_factura: Optional[str] = None
    tipo_documento_original: Optional[str] = None
    nro_documento_original: Optional[str] = None
    total: float
    saldo: float
    estado: str
    fecha_vencimiento: Optional[datetime] = None
    estado_vencimiento: str
    tipo_compra: str = "ORIGINAL"
    estado_entrega: str
    clientes_nombres: List[str] = []
    ventas_codigos: List[str] = []


class PagoProveedorMetodoCreate(BaseModel):
    metodo_pago: str = "EFECTIVO"
    monto: float
    banco_id: Optional[int] = None
    nro_comprobante: Optional[str] = None


class PagoProveedorMetodoOut(BaseModel):
    metodo_pago: str
    monto: float
    banco_id: Optional[int] = None
    banco_nombre: Optional[str] = None
    nro_comprobante: Optional[str] = None


class PagoProveedorCreate(BaseModel):
    fecha: Optional[datetime] = None
    metodos_pago: List[PagoProveedorMetodoCreate]
    compra_ids: List[int] = []
    factura_global: Optional[str] = None
    usar_factura_generica: bool = False


class PagoProveedorAplicacionOut(BaseModel):
    compra_id: int
    documento: str
    monto_aplicado: float
    saldo_restante: float


class PagoProveedorOut(BaseModel):
    proveedor_id: int
    proveedor_nombre: str
    total_aplicado: float
    lote_pago_id: Optional[str] = None
    aplicaciones: List[PagoProveedorAplicacionOut] = []


class HistorialPagoProveedorOut(BaseModel):
    grupo_id: str
    lote_pago_id: Optional[str] = None
    fecha: datetime
    proveedor_id: Optional[int] = None
    proveedor_nombre: Optional[str] = None
    total: float
    cantidad_documentos: int = 0
    documentos: List[str] = []
    os_origen: List[str] = []
    facturas: List[str] = []
    clientes: List[str] = []
    metodos: List[str] = []
    comprobantes: List[str] = []
    estado: str = "ACTIVO"


class HistorialPagoProveedorDetalleOut(BaseModel):
    grupo_id: str
    lote_pago_id: Optional[str] = None
    fecha: datetime
    proveedor_id: Optional[int] = None
    proveedor_nombre: Optional[str] = None
    total: float
    compra_ids: List[int] = []
    documentos: List[str] = []
    os_origen: List[str] = []
    facturas: List[str] = []
    clientes: List[str] = []
    puede_usar_factura_global: bool = False
    factura_global: Optional[str] = None
    metodos_pago: List[PagoProveedorMetodoOut] = []


class VentaPendienteCompraItemOut(BaseModel):
    presupuesto_item_id: int
    producto_id: Optional[int] = None
    producto_nombre: str
    proveedor_id: Optional[int] = None
    proveedor_nombre: Optional[str] = None
    cantidad_total: int
    cantidad_comprada: int
    cantidad_pendiente: int
    costo_sugerido: float = 0.0
    bajo_pedido: bool


class VentaPendienteCompraOut(BaseModel):
    venta_id: int
    venta_codigo: str
    cliente_id: Optional[int] = None
    cliente_nombre: str
    fecha: datetime
    estado_entrega: Optional[str] = None
    requiere_compra: bool = True
    items_pendientes: List[VentaPendienteCompraItemOut] = []


# ──────────────────────────────────────────────
# CAJA & BANCOS
# ──────────────────────────────────────────────

class MovimientoCajaOut(BaseModel):
    id: int
    fecha: datetime
    tipo: str
    monto: float
    concepto: Optional[str]
    saldo_anterior: float
    saldo_nuevo: float
    class Config:
        from_attributes = True

class BancoOut(BaseModel):
    id: int
    nombre_banco: str
    numero_cuenta: str
    titular: str
    tipo_cuenta: Optional[str]
    saldo_actual: float
    porcentaje_comision: float
    class Config:
        from_attributes = True

class BancoCreate(BaseModel):
    nombre_banco: str
    numero_cuenta: str
    titular: str
    tipo_cuenta: Optional[str] = None
    saldo_actual: float = 0.0
    porcentaje_comision: float = 3.3

class MovimientoBancoOut(BaseModel):
    id: int
    fecha: datetime
    tipo: str
    monto: float
    concepto: Optional[str]
    saldo_anterior: float
    saldo_nuevo: float
    class Config:
        from_attributes = True


class TransferenciaInternaCreate(BaseModel):
    origen_tipo: str
    destino_tipo: str
    monto: float
    banco_origen_id: Optional[int] = None
    banco_destino_id: Optional[int] = None
    concepto: Optional[str] = None

    @field_validator("origen_tipo", "destino_tipo")
    @classmethod
    def normalizar_tipo_transferencia(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"CAJA", "BANCO"}:
            raise ValueError("El tipo debe ser CAJA o BANCO")
        return value

    @field_validator("concepto")
    @classmethod
    def normalizar_concepto_transferencia(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value else value


class TransferenciaInternaOut(BaseModel):
    transferencia_id: str
    origen_tipo: str
    destino_tipo: str
    monto: float
    concepto: Optional[str] = None


class TransferenciaInternaHistorialOut(BaseModel):
    transferencia_id: str
    fecha: datetime
    origen_tipo: str
    destino_tipo: str
    origen_label: str
    destino_label: str
    banco_origen_id: Optional[int] = None
    banco_destino_id: Optional[int] = None
    monto: float
    concepto: Optional[str] = None
    conciliada: bool = True
    movimientos_detectados: int = 0


# ───────────────────────────────────────────────────────
# COMISIONES
# ───────────────────────────────────────────────────────

class ComisionOut(BaseModel):
    id: int
    fecha: datetime
    referidor_id: int
    referidor_nombre: Optional[str] = None
    venta_id: Optional[int] = None
    venta_codigo: Optional[str] = None
    cliente_nombre: Optional[str] = None
    descripcion: Optional[str] = None
    monto: float
    estado: str
    movimiento_banco_id: Optional[int] = None
    movimiento_caja_id: Optional[int] = None


class ComisionPagoCreate(BaseModel):
    metodo_pago: str = "EFECTIVO"
    banco_id: Optional[int] = None
    numero_referencia: Optional[str] = None

    @field_validator("metodo_pago")
    @classmethod
    def normalizar_metodo_pago_comision(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"EFECTIVO", "TRANSFERENCIA", "CHEQUE"}:
            raise ValueError("metodo_pago invalido")
        return value

    @field_validator("numero_referencia")
    @classmethod
    def normalizar_numero_referencia(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value else value


# ──────────────────────────────────────────────
# GASTOS
# ──────────────────────────────────────────────

class GastoCreate(BaseModel):
    categoria_id: int
    monto: float
    concepto: str
    comprobante: Optional[str] = None
    metodo_pago: str = "EFECTIVO"
    banco_id: Optional[int] = None
    fecha: Optional[datetime] = None

    @field_validator("concepto")
    @classmethod
    def normalizar_concepto_gasto(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("concepto es obligatorio")
        return value

    @field_validator("comprobante")
    @classmethod
    def normalizar_comprobante_gasto(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value else value

    @field_validator("metodo_pago")
    @classmethod
    def normalizar_metodo_pago_gasto(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"EFECTIVO", "TRANSFERENCIA", "TARJETA", "CHEQUE"}:
            raise ValueError("metodo_pago invalido")
        return value

class GastoOut(BaseModel):
    id: int
    fecha: datetime
    categoria_id: int
    categoria_nombre: Optional[str] = None
    monto: float
    concepto: str
    comprobante: Optional[str]
    metodo_pago: Optional[str]
    banco_id: Optional[int] = None
    banco_nombre: Optional[str] = None
    class Config:
        from_attributes = True


class CategoriaGastoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    categoria_padre_id: Optional[int] = None

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre_categoria_gasto(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("nombre es obligatorio")
        return value

    @field_validator("descripcion")
    @classmethod
    def normalizar_descripcion_categoria_gasto(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value else value


class CategoriaGastoOut(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str]
    categoria_padre_id: Optional[int]
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# DASHBOARD
# ──────────────────────────────────────────────

class DashboardStats(BaseModel):
    ventas_hoy: float
    ventas_mes: float
    clientes_total: int
    ventas_pendientes: int
    compras_pendientes: int
    saldo_caja: float
    total_bancos: float


# ————————————————————————————————————————————————
# CLINICA
# ————————————————————————————————————————————————

class ClinicaRecentConsultaOut(BaseModel):
    id: int
    fecha: datetime
    tipo: str
    paciente_id: int
    paciente_nombre: str
    doctor_nombre: Optional[str] = None
    lugar_nombre: Optional[str] = None
    resumen: Optional[str] = None


class ClinicaAlertOut(BaseModel):
    tipo: str
    titulo: str
    mensaje: str
    color: str


class ClinicaDashboardResumenOut(BaseModel):
    total_pacientes: int
    doctores_activos: int
    consultas_hoy: int
    consultas_semana: int
    recetas_mes: int
    pacientes_nuevos_mes: int
    lugares_activos: int
    consultas_oftalmologia_mes: int
    consultas_contactologia_mes: int
    recientes: List[ClinicaRecentConsultaOut] = []
    alertas: List[ClinicaAlertOut] = []


class ClinicaPacienteOut(BaseModel):
    id: int
    nombre_completo: str
    fecha_nacimiento: Optional[date] = None
    edad_manual: Optional[int] = None
    edad_calculada: Optional[int] = None
    ci_pasaporte: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    antecedentes_oculares: Optional[str] = None
    notas: Optional[str] = None
    fecha_registro: Optional[datetime] = None
    cliente_id: Optional[int] = None
    referidor_id: Optional[int] = None
    referidor_nombre: Optional[str] = None
    es_cliente: bool = False
    consultas_oftalmologicas: int = 0
    consultas_contactologia: int = 0
    ultima_consulta: Optional[datetime] = None


class ClinicaPacientesListOut(BaseModel):
    items: List[ClinicaPacienteOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class ClinicaPacienteCreateIn(BaseModel):
    nombre_completo: str
    fecha_nacimiento: Optional[date] = None
    edad_manual: Optional[int] = None
    ci_pasaporte: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    referidor_id: Optional[int] = None
    antecedentes_oculares: Optional[str] = None
    notas: Optional[str] = None


class ClinicaPacienteUpdateIn(BaseModel):
    nombre_completo: str
    fecha_nacimiento: Optional[date] = None
    edad_manual: Optional[int] = None
    ci_pasaporte: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    referidor_id: Optional[int] = None
    antecedentes_oculares: Optional[str] = None
    notas: Optional[str] = None


class ClinicaConsultaHistorialOut(BaseModel):
    id: int
    fecha: datetime
    tipo: str
    doctor_nombre: Optional[str] = None
    lugar_nombre: Optional[str] = None
    motivo: Optional[str] = None
    diagnostico: Optional[str] = None
    resumen: Optional[str] = None
    plan_tratamiento: Optional[str] = None
    tipo_lente: Optional[str] = None
    material_lente: Optional[str] = None
    marca_recomendada: Optional[str] = None
    fecha_control: Optional[date] = None


class ClinicaRecetaMedicamentoDetalleHistorialOut(BaseModel):
    medicamento_id: Optional[int] = None
    medicamento: str
    posologia_personalizada: Optional[str] = None
    duracion_tratamiento: Optional[str] = None


class ClinicaRecetaMedicamentoHistorialOut(BaseModel):
    id: int
    fecha_emision: datetime
    doctor_nombre: Optional[str] = None
    diagnostico: Optional[str] = None
    observaciones: Optional[str] = None
    consulta_id: Optional[int] = None
    consulta_tipo: Optional[str] = None
    detalles: List[ClinicaRecetaMedicamentoDetalleHistorialOut] = []


class ClinicaRecetaRelacionadaOut(BaseModel):
    id: int
    fecha_emision: datetime
    doctor_nombre: Optional[str] = None
    diagnostico: Optional[str] = None
    observaciones: Optional[str] = None


class ClinicaMedicamentoSimpleOut(BaseModel):
    id: int
    nombre_comercial: str


class ClinicaPatologiaSimpleOut(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    sintomas: Optional[str] = None
    tratamiento_no_farmacologico: Optional[str] = None


class ClinicaVademecumTratamientoIn(BaseModel):
    medicamento_id: int
    posologia_recomendada: Optional[str] = None


class ClinicaVademecumTratamientoOut(BaseModel):
    id: int
    medicamento_id: int
    medicamento_nombre: str
    posologia_recomendada: Optional[str] = None


class ClinicaVademecumMedicamentoIn(BaseModel):
    nombre_comercial: str
    droga: Optional[str] = None
    presentacion: Optional[str] = None
    laboratorio: Optional[str] = None
    indicaciones: Optional[str] = None
    contraindicaciones: Optional[str] = None
    posologia_habitual: Optional[str] = None
    notas: Optional[str] = None


class ClinicaVademecumMedicamentoOut(BaseModel):
    id: int
    nombre_comercial: str
    droga: Optional[str] = None
    presentacion: Optional[str] = None
    laboratorio: Optional[str] = None
    indicaciones: Optional[str] = None
    contraindicaciones: Optional[str] = None
    posologia_habitual: Optional[str] = None
    notas: Optional[str] = None
    tratamientos_count: int = 0
    recetas_count: int = 0


class ClinicaVademecumMedicamentosListOut(BaseModel):
    items: List[ClinicaVademecumMedicamentoOut] = []
    total: int
    page: int
    page_size: int
    total_pages: int


class ClinicaVademecumPatologiaIn(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    sintomas: Optional[str] = None
    tratamiento_no_farmacologico: Optional[str] = None
    tratamientos: List[ClinicaVademecumTratamientoIn] = []


class ClinicaVademecumPatologiaOut(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    sintomas: Optional[str] = None
    tratamiento_no_farmacologico: Optional[str] = None
    tratamientos: List[ClinicaVademecumTratamientoOut] = []


class ClinicaVademecumPatologiasListOut(BaseModel):
    items: List[ClinicaVademecumPatologiaOut] = []
    total: int
    page: int
    page_size: int
    total_pages: int


class ClinicaRecetaMedicamentoDetalleIn(BaseModel):
    medicamento_id: int
    posologia_personalizada: Optional[str] = None
    duracion_tratamiento: Optional[str] = None


class ClinicaRecetaMedicamentoIn(BaseModel):
    paciente_id: int
    consulta_id: Optional[int] = None
    consulta_tipo: Optional[str] = None
    fecha_emision: Optional[datetime] = None
    doctor_nombre: Optional[str] = None
    diagnostico: Optional[str] = None
    observaciones: Optional[str] = None
    detalles: List[ClinicaRecetaMedicamentoDetalleIn] = []


class ClinicaRecetaMedicamentoOut(BaseModel):
    id: int
    paciente_id: int
    consulta_id: Optional[int] = None
    consulta_tipo: Optional[str] = None
    fecha_emision: datetime
    doctor_nombre: Optional[str] = None
    diagnostico: Optional[str] = None
    observaciones: Optional[str] = None
    detalles: List[ClinicaRecetaMedicamentoDetalleHistorialOut] = []


class ClinicaPacienteHistorialOut(BaseModel):
    paciente: ClinicaPacienteOut
    oftalmologia: List[ClinicaConsultaHistorialOut] = []
    contactologia: List[ClinicaConsultaHistorialOut] = []
    recetas_medicamentos: List[ClinicaRecetaMedicamentoHistorialOut] = []


class ClinicaHistorialGeneralItemOut(BaseModel):
    id: int
    tipo: str
    fecha: datetime
    paciente_id: int
    paciente_nombre: str
    paciente_ci: Optional[str] = None
    doctor_id: Optional[int] = None
    doctor_nombre: Optional[str] = None
    lugar_atencion_id: Optional[int] = None
    lugar_nombre: Optional[str] = None
    motivo: Optional[str] = None
    diagnostico: Optional[str] = None
    resumen: Optional[str] = None
    observaciones: Optional[str] = None


class ClinicaHistorialGeneralOut(BaseModel):
    items: List[ClinicaHistorialGeneralItemOut] = []
    total: int
    page: int
    page_size: int
    total_pages: int
    total_oftalmologia: int = 0
    total_contactologia: int = 0
    total_recetas: int = 0


class ClinicaDoctorSimpleOut(BaseModel):
    id: int
    nombre_completo: str


class ClinicaDoctorOut(BaseModel):
    id: int
    nombre_completo: str
    especialidad: Optional[str] = None
    registro_profesional: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    activo: bool = True
    consultas_oftalmologicas: int = 0
    consultas_contactologia: int = 0


class ClinicaDoctoresListOut(BaseModel):
    items: List[ClinicaDoctorOut] = []
    total: int
    page: int
    page_size: int
    total_pages: int


class ClinicaDoctorIn(BaseModel):
    nombre_completo: str
    especialidad: Optional[str] = None
    registro_profesional: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    activo: bool = True


class ClinicaLugarSimpleOut(BaseModel):
    id: int
    nombre: str


class ClinicaTurnoIn(BaseModel):
    paciente_id: Optional[int] = None
    paciente_nombre_libre: Optional[str] = None
    doctor_id: Optional[int] = None
    lugar_atencion_id: Optional[int] = None
    fecha_hora: datetime
    estado: Optional[str] = "PENDIENTE"
    motivo: Optional[str] = None
    notas: Optional[str] = None


class ClinicaTurnoOut(BaseModel):
    id: int
    paciente_id: Optional[int] = None
    paciente_nombre: str
    paciente_nombre_libre: Optional[str] = None
    paciente_ci: Optional[str] = None
    doctor_id: Optional[int] = None
    doctor_nombre: Optional[str] = None
    lugar_atencion_id: Optional[int] = None
    lugar_nombre: Optional[str] = None
    fecha_hora: datetime
    estado: str
    motivo: Optional[str] = None
    notas: Optional[str] = None


class ClinicaTurnosListOut(BaseModel):
    items: List[ClinicaTurnoOut] = []
    total: int
    page: int
    page_size: int
    total_pages: int


class ClinicaLugarIn(BaseModel):
    nombre: str
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    contacto_responsable: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None
    activo: bool = True


class ClinicaLugarOut(BaseModel):
    id: int
    nombre: str
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    contacto_responsable: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None
    activo: bool = True
    consultas_oftalmologicas: int = 0
    consultas_contactologia: int = 0
    fecha_creacion: Optional[datetime] = None


class ClinicaLugaresListOut(BaseModel):
    items: list[ClinicaLugarOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class ClinicaCuestionarioIn(BaseModel):
    paciente_id: int
    motivo_principal: Optional[str] = None
    tiempo_molestias: Optional[str] = None
    expectativa: Optional[str] = None
    horas_pantalla: Optional[str] = None
    conduce: Optional[str] = None
    actividad_laboral: Optional[str] = None
    hobbies: Optional[str] = None
    cefalea: bool = False
    ardor: bool = False
    ojo_seco: bool = False
    lagrimeo: bool = False
    fotofobia: bool = False
    vision_doble: bool = False
    destellos: bool = False
    manchas: bool = False
    dificultad_cerca: bool = False
    diabetes: bool = False
    diabetes_controlada: bool = True
    hipertension: bool = False
    alergias: bool = False
    migranas: bool = False
    cirugias_previas: bool = False
    trauma_ocular: bool = False
    medicamentos: Optional[str] = None
    antecedentes_familiares: Optional[str] = None
    usa_anteojos: bool = False
    proposito_anteojos: Optional[str] = None
    usa_lentes_contacto: bool = False
    tipo_lentes_contacto: Optional[str] = None
    horas_uso_lc: Optional[str] = None
    molestias_lc: bool = False


class ClinicaCuestionarioOut(BaseModel):
    id: int
    paciente_id: int
    fecha: datetime
    motivo_principal: Optional[str] = None
    tiempo_molestias: Optional[str] = None
    expectativa: Optional[str] = None
    horas_pantalla: Optional[str] = None
    conduce: Optional[str] = None
    actividad_laboral: Optional[str] = None
    hobbies: Optional[str] = None
    cefalea: bool = False
    ardor: bool = False
    ojo_seco: bool = False
    lagrimeo: bool = False
    fotofobia: bool = False
    vision_doble: bool = False
    destellos: bool = False
    manchas: bool = False
    dificultad_cerca: bool = False
    diabetes: bool = False
    diabetes_controlada: bool = True
    hipertension: bool = False
    alergias: bool = False
    migranas: bool = False
    cirugias_previas: bool = False
    trauma_ocular: bool = False
    medicamentos: Optional[str] = None
    antecedentes_familiares: Optional[str] = None
    usa_anteojos: bool = False
    proposito_anteojos: Optional[str] = None
    usa_lentes_contacto: bool = False
    tipo_lentes_contacto: Optional[str] = None
    horas_uso_lc: Optional[str] = None
    molestias_lc: bool = False


class ClinicaConsultaOftalmologicaIn(BaseModel):
    paciente_id: int
    doctor_id: Optional[int] = None
    lugar_atencion_id: Optional[int] = None
    agenda_turno_id: Optional[int] = None
    fecha: Optional[datetime] = None
    motivo: Optional[str] = None
    diagnostico: Optional[str] = None
    plan_tratamiento: Optional[str] = None
    tipo_lente: Optional[str] = None
    material_lente: Optional[str] = None
    tratamientos: Optional[str] = None
    fecha_control: Optional[date] = None
    av_sc_lejos_od: Optional[str] = None
    av_sc_lejos_oi: Optional[str] = None
    av_cc_lejos_od: Optional[str] = None
    av_cc_lejos_oi: Optional[str] = None
    ref_od_esfera: Optional[str] = None
    ref_od_cilindro: Optional[str] = None
    ref_od_eje: Optional[str] = None
    ref_od_adicion: Optional[str] = None
    ref_oi_esfera: Optional[str] = None
    ref_oi_cilindro: Optional[str] = None
    ref_oi_eje: Optional[str] = None
    ref_oi_adicion: Optional[str] = None
    examen_refraccion: Optional[bool] = True
    examen_biomicroscopia: Optional[bool] = False
    examen_oftalmoscopia: Optional[bool] = False
    examen_tonometria: Optional[bool] = False
    examen_campo_visual: Optional[bool] = False
    examen_oct: Optional[bool] = False
    examen_retinografia: Optional[bool] = False
    examen_paquimetria: Optional[bool] = False
    examen_topografia: Optional[bool] = False
    examen_gonioscopia: Optional[bool] = False
    examen_angiofluoresceinografia: Optional[bool] = False
    examen_cicloplegia: Optional[bool] = False
    biomicroscopia_parpados: Optional[str] = None
    biomicroscopia_conjuntiva: Optional[str] = None
    biomicroscopia_cornea: Optional[str] = None
    biomicroscopia_camara_anterior: Optional[str] = None
    biomicroscopia_iris: Optional[str] = None
    biomicroscopia_cristalino: Optional[str] = None
    tonometria_od: Optional[str] = None
    tonometria_oi: Optional[str] = None
    tonometria_metodo: Optional[str] = None
    campo_visual_tipo: Optional[str] = None
    campo_visual_od: Optional[str] = None
    campo_visual_oi: Optional[str] = None
    oct_tipo: Optional[str] = None
    oct_hallazgos: Optional[str] = None
    retinografia_hallazgos: Optional[str] = None
    paquimetria_od: Optional[str] = None
    paquimetria_oi: Optional[str] = None
    topografia_tipo: Optional[str] = None
    topografia_hallazgos: Optional[str] = None
    gonioscopia_od: Optional[str] = None
    gonioscopia_oi: Optional[str] = None
    gonioscopia_hallazgos: Optional[str] = None
    angiofluoresceinografia_hallazgos: Optional[str] = None
    cicloplegia_medicamento: Optional[str] = None
    cicloplegia_dosis: Optional[str] = None
    cicloplegia_od_esfera: Optional[str] = None
    cicloplegia_od_cilindro: Optional[str] = None
    cicloplegia_od_eje: Optional[str] = None
    cicloplegia_oi_esfera: Optional[str] = None
    cicloplegia_oi_cilindro: Optional[str] = None
    cicloplegia_oi_eje: Optional[str] = None
    estudios_solicitados: Optional[str] = None
    observaciones: Optional[str] = None


class ClinicaConsultaContactologiaIn(BaseModel):
    paciente_id: int
    doctor_id: Optional[int] = None
    lugar_atencion_id: Optional[int] = None
    agenda_turno_id: Optional[int] = None
    fecha: Optional[datetime] = None
    tipo_lente: Optional[str] = None
    diseno: Optional[str] = None
    diagnostico: Optional[str] = None
    plan_tratamiento: Optional[str] = None
    resumen_resultados: Optional[str] = None
    marca_recomendada: Optional[str] = None
    fecha_control: Optional[date] = None
    observaciones: Optional[str] = None


class ClinicaConsultaDetalleOut(BaseModel):
    id: int
    paciente_id: int
    tipo: str
    fecha: datetime
    agenda_turno_id: Optional[int] = None
    doctor_id: Optional[int] = None
    doctor_nombre: Optional[str] = None
    lugar_atencion_id: Optional[int] = None
    lugar_nombre: Optional[str] = None
    motivo: Optional[str] = None
    diagnostico: Optional[str] = None
    plan_tratamiento: Optional[str] = None
    tipo_lente: Optional[str] = None
    material_lente: Optional[str] = None
    tratamientos: Optional[str] = None
    fecha_control: Optional[date] = None
    av_sc_lejos_od: Optional[str] = None
    av_sc_lejos_oi: Optional[str] = None
    av_cc_lejos_od: Optional[str] = None
    av_cc_lejos_oi: Optional[str] = None
    ref_od_esfera: Optional[str] = None
    ref_od_cilindro: Optional[str] = None
    ref_od_eje: Optional[str] = None
    ref_od_adicion: Optional[str] = None
    ref_oi_esfera: Optional[str] = None
    ref_oi_cilindro: Optional[str] = None
    ref_oi_eje: Optional[str] = None
    ref_oi_adicion: Optional[str] = None
    examen_refraccion: Optional[bool] = None
    examen_biomicroscopia: Optional[bool] = None
    examen_oftalmoscopia: Optional[bool] = None
    examen_tonometria: Optional[bool] = None
    examen_campo_visual: Optional[bool] = None
    examen_oct: Optional[bool] = None
    examen_retinografia: Optional[bool] = None
    examen_paquimetria: Optional[bool] = None
    examen_topografia: Optional[bool] = None
    examen_gonioscopia: Optional[bool] = None
    examen_angiofluoresceinografia: Optional[bool] = None
    examen_cicloplegia: Optional[bool] = None
    biomicroscopia_parpados: Optional[str] = None
    biomicroscopia_conjuntiva: Optional[str] = None
    biomicroscopia_cornea: Optional[str] = None
    biomicroscopia_camara_anterior: Optional[str] = None
    biomicroscopia_iris: Optional[str] = None
    biomicroscopia_cristalino: Optional[str] = None
    tonometria_od: Optional[str] = None
    tonometria_oi: Optional[str] = None
    tonometria_metodo: Optional[str] = None
    campo_visual_tipo: Optional[str] = None
    campo_visual_od: Optional[str] = None
    campo_visual_oi: Optional[str] = None
    oct_tipo: Optional[str] = None
    oct_hallazgos: Optional[str] = None
    retinografia_hallazgos: Optional[str] = None
    paquimetria_od: Optional[str] = None
    paquimetria_oi: Optional[str] = None
    topografia_tipo: Optional[str] = None
    topografia_hallazgos: Optional[str] = None
    gonioscopia_od: Optional[str] = None
    gonioscopia_oi: Optional[str] = None
    gonioscopia_hallazgos: Optional[str] = None
    angiofluoresceinografia_hallazgos: Optional[str] = None
    cicloplegia_medicamento: Optional[str] = None
    cicloplegia_dosis: Optional[str] = None
    cicloplegia_od_esfera: Optional[str] = None
    cicloplegia_od_cilindro: Optional[str] = None
    cicloplegia_od_eje: Optional[str] = None
    cicloplegia_oi_esfera: Optional[str] = None
    cicloplegia_oi_cilindro: Optional[str] = None
    cicloplegia_oi_eje: Optional[str] = None
    estudios_solicitados: Optional[str] = None
    diseno: Optional[str] = None
    resumen_resultados: Optional[str] = None
    marca_recomendada: Optional[str] = None
    fecha_control: Optional[date] = None
    observaciones: Optional[str] = None
    tiene_receta_lentes_pdf: bool = False
    tiene_indicaciones_pdf: bool = False
    recetas_medicamentos_relacionadas: List[ClinicaRecetaRelacionadaOut] = []
