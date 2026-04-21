"""
HESAKA Web — Modelos de negocio (tenant DB)
Migrados desde app/database.py del sistema desktop HESAKA.
Estos modelos se crean en la BD de cada cliente (tenant).
"""
from sqlalchemy import (
    Column, Integer, String, Float, ForeignKey, Text,
    DateTime, Date, Boolean, Table, Index
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class TimestampMixin:
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

# ─── Tablas de asociación ──────────────────────────────────────────────────────

producto_atributos = Table(
    'producto_atributos', Base.metadata,
    Column('producto_id', Integer, ForeignKey('productos.id'), primary_key=True),
    Column('atributo_id', Integer, ForeignKey('atributos.id'), primary_key=True)
)

categoria_atributos = Table(
    'categoria_atributos', Base.metadata,
    Column('categoria_id', Integer, ForeignKey('categorias.id'), primary_key=True),
    Column('atributo_id', Integer, ForeignKey('atributos.id'), primary_key=True)
)

# ─── Catálogos base ────────────────────────────────────────────────────────────

class Categoria(TimestampMixin, Base):
    __tablename__ = 'categorias'
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), unique=True, nullable=False)
    prefijo = Column(String(4), nullable=False)
    descripcion = Column(Text)
    categoria_padre_id = Column(Integer, ForeignKey('categorias.id'), nullable=True)
    productos = relationship("Producto", back_populates="categoria_rel")
    atributos_disponibles = relationship("Atributo", secondary=categoria_atributos, back_populates="categorias")
    categoria_padre = relationship("Categoria", remote_side=[id], backref="subcategorias")


class Atributo(TimestampMixin, Base):
    __tablename__ = 'atributos'
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), unique=True, nullable=False)
    productos = relationship("Producto", secondary=producto_atributos, back_populates="atributos")
    categorias = relationship("Categoria", secondary=categoria_atributos, back_populates="atributos_disponibles")


class Proveedor(TimestampMixin, Base):
    __tablename__ = 'proveedores'
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), nullable=False)
    telefono = Column(String(50))
    email = Column(String(100))
    direccion = Column(Text)
    productos = relationship("Producto", back_populates="proveedor_rel")


class Marca(TimestampMixin, Base):
    __tablename__ = 'marcas'
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), unique=True, nullable=False)
    productos = relationship("Producto", back_populates="marca_rel")


class Producto(TimestampMixin, Base):
    __tablename__ = 'productos'
    __table_args__ = (
        Index('idx_producto_nombre', 'nombre'),
        Index('idx_producto_categoria', 'categoria_id'),
        Index('idx_producto_cod_fabricante', 'codigo_fabricante'),
        Index('idx_producto_marca', 'marca'),
        Index('idx_producto_marca_id', 'marca_id'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    codigo = Column(String(50), unique=True, nullable=False)
    nombre = Column(String(200), nullable=False)
    codigo_fabricante = Column(String(100), nullable=True)
    marca = Column(String(100), nullable=True)  # Marca comercial (ej: ESSILOR, HOYA, TRANSITIONS)
    marca_id = Column(Integer, ForeignKey('marcas.id'), nullable=True)
    marca_rel = relationship("Marca", back_populates="productos", lazy='selectin')
    categoria_id = Column(Integer, ForeignKey('categorias.id'), nullable=False)
    categoria_rel = relationship("Categoria", back_populates="productos", lazy='selectin')
    proveedor_id = Column(Integer, ForeignKey('proveedores.id'), nullable=True)
    proveedor_rel = relationship("Proveedor", back_populates="productos", lazy='selectin')
    precio_venta = Column(Float, nullable=False)
    costo = Column(Float)
    costo_variable = Column(Boolean, default=False)
    stock_actual = Column(Integer, default=0)
    impuesto = Column(Integer, default=10)
    descripcion = Column(Text)
    activo = Column(Boolean, default=True)
    bajo_pedido = Column(Boolean, default=False)
    atributos = relationship("Atributo", secondary=producto_atributos, back_populates="productos", lazy='selectin')


# ─── Clientes & Referidores ────────────────────────────────────────────────────

class Referidor(TimestampMixin, Base):
    __tablename__ = 'referidores'
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), nullable=False)
    telefono = Column(String(50))
    tipo_comision = Column(String(20), nullable=False)
    valor_comision = Column(Float, default=0.0)
    es_porcentaje = Column(Integer, default=0)
    clientes = relationship("Cliente", back_populates="referidor_rel", lazy='selectin')
    comisiones = relationship("Comision", back_populates="referidor_rel", lazy='selectin')


class Vendedor(TimestampMixin, Base):
    __tablename__ = 'vendedores'
    __table_args__ = (
        Index('idx_vendedor_nombre', 'nombre'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), nullable=False)
    telefono = Column(String(50))
    email = Column(String(100))
    notas = Column(Text)
    activo = Column(Boolean, default=True)
    ventas = relationship("Venta", back_populates="vendedor_rel", lazy='selectin')
    presupuestos = relationship("Presupuesto", back_populates="vendedor_rel", lazy='selectin')


class CanalVenta(TimestampMixin, Base):
    __tablename__ = 'canales_venta'
    __table_args__ = (
        Index('idx_canal_venta_nombre', 'nombre'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text)
    activo = Column(Boolean, default=True)
    ventas = relationship("Venta", back_populates="canal_venta_rel", lazy='selectin')
    presupuestos = relationship("Presupuesto", back_populates="canal_venta_rel", lazy='selectin')


class Cliente(TimestampMixin, Base):
    __tablename__ = 'clientes'
    __table_args__ = (
        Index('idx_cliente_nombre', 'nombre'),
        Index('idx_cliente_ci', 'ci'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), nullable=False)
    ci = Column(String(20))
    telefono = Column(String(20))
    email = Column(String(100))
    direccion = Column(Text)
    fecha_registro = Column(DateTime, default=datetime.now)
    notas = Column(Text)
    referidor_id = Column(Integer, ForeignKey('referidores.id'), nullable=True)
    referidor_rel = relationship("Referidor", back_populates="clientes", lazy='selectin')


# ─── Presupuestos ──────────────────────────────────────────────────────────────

class PresupuestoGrupo(TimestampMixin, Base):
    __tablename__ = 'presupuesto_grupos'
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.now)
    estado = Column(String(20), default='PENDIENTE')
    total = Column(Float, default=0.0)
    venta_id = Column(Integer, ForeignKey('ventas.id'), nullable=True)
    venta_rel = relationship("Venta", lazy='selectin')
    presupuestos = relationship("Presupuesto", back_populates="grupo_rel", lazy='selectin')


class Presupuesto(TimestampMixin, Base):
    __tablename__ = 'presupuestos'
    __table_args__ = (
        Index('idx_presupuesto_fecha', 'fecha'),
        Index('idx_presupuesto_estado', 'estado'),
        Index('idx_presupuesto_cliente', 'cliente_id'),
        Index('idx_presupuesto_estado_fecha', 'estado', 'fecha'),
        Index('idx_presupuesto_cliente_fecha', 'cliente_id', 'fecha'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    codigo = Column(String(50), unique=True, nullable=False)
    fecha = Column(DateTime, default=datetime.now)
    estado = Column(String(20), default='BORRADOR')
    cliente_id = Column(Integer, ForeignKey('clientes.id'), nullable=False)
    cliente_rel = relationship("Cliente", lazy='selectin')
    total = Column(Float, default=0.0)
    graduacion_od_esfera = Column(String(20))
    graduacion_od_cilindro = Column(String(20))
    graduacion_od_eje = Column(String(20))
    graduacion_od_adicion = Column(String(20))
    graduacion_oi_esfera = Column(String(20))
    graduacion_oi_cilindro = Column(String(20))
    graduacion_oi_eje = Column(String(20))
    graduacion_oi_adicion = Column(String(20))
    doctor_receta = Column(String(255), nullable=True)
    observaciones = Column(String(255), nullable=True)
    fecha_receta = Column(DateTime, nullable=True)
    fecha_proximo_control = Column(Date, nullable=True)
    no_requiere_proximo_control = Column(Boolean, default=False, nullable=False)
    consulta_clinica_id = Column(Integer, nullable=True)
    consulta_clinica_tipo = Column(String(30), nullable=True)
    vendedor_id = Column(Integer, ForeignKey('vendedores.id'), nullable=True)
    vendedor_rel = relationship("Vendedor", back_populates="presupuestos", lazy='selectin')
    canal_venta_id = Column(Integer, ForeignKey('canales_venta.id'), nullable=True)
    canal_venta_rel = relationship("CanalVenta", back_populates="presupuestos", lazy='selectin')
    referidor_id = Column(Integer, ForeignKey('referidores.id'), nullable=True)
    referidor_rel = relationship("Referidor", lazy='selectin')
    comision_monto = Column(Float, default=0.0)
    grupo_id = Column(Integer, ForeignKey('presupuesto_grupos.id'), nullable=True)
    grupo_rel = relationship("PresupuestoGrupo", back_populates="presupuestos", lazy='selectin')
    items = relationship("PresupuestoItem", back_populates="presupuesto_rel", cascade="all, delete-orphan", lazy='selectin')
    venta_rel = relationship("Venta", back_populates="presupuesto_rel", lazy='selectin')


class PresupuestoItem(TimestampMixin, Base):
    __tablename__ = 'presupuesto_items'
    id = Column(Integer, primary_key=True, autoincrement=True)
    presupuesto_id = Column(Integer, ForeignKey('presupuestos.id'), nullable=False)
    presupuesto_rel = relationship("Presupuesto", back_populates="items", lazy='selectin')
    producto_id = Column(Integer, ForeignKey('productos.id'), nullable=False)
    producto_rel = relationship("Producto", lazy='selectin')
    cantidad = Column(Integer, default=1)
    precio_unitario = Column(Float, nullable=False)
    costo_unitario = Column(Float, default=0.0)
    descuento = Column(Float, default=0.0)
    subtotal = Column(Float, nullable=False)
    descripcion_personalizada = Column(Text, nullable=True)
    codigo_armazon = Column(String(50), nullable=True)
    medidas_armazon = Column(String(50), nullable=True)


# ─── Ventas & Pagos ────────────────────────────────────────────────────────────

class Venta(TimestampMixin, Base):
    __tablename__ = 'ventas'
    __table_args__ = (
        Index('idx_venta_fecha', 'fecha'),
        Index('idx_venta_estado', 'estado'),
        Index('idx_venta_cliente', 'cliente_id'),
        Index('idx_venta_fecha_estado', 'fecha', 'estado'),
        Index('idx_venta_cliente_fecha', 'cliente_id', 'fecha'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    codigo = Column(String(50), unique=True, nullable=False)
    fecha = Column(DateTime, default=datetime.now)
    cliente_id = Column(Integer, ForeignKey('clientes.id'), nullable=False)
    cliente_rel = relationship("Cliente", lazy='selectin')
    presupuesto_id = Column(Integer, ForeignKey('presupuestos.id'), nullable=True)
    presupuesto_rel = relationship("Presupuesto", back_populates="venta_rel", lazy='selectin')
    total = Column(Float, default=0.0)
    saldo = Column(Float, default=0.0)
    estado = Column(String(20), default='PENDIENTE')
    estado_entrega = Column(String(20), default='ENTREGADO')
    vendedor_id = Column(Integer, ForeignKey('vendedores.id'), nullable=True)
    vendedor_rel = relationship("Vendedor", back_populates="ventas", lazy='selectin')
    canal_venta_id = Column(Integer, ForeignKey('canales_venta.id'), nullable=True)
    canal_venta_rel = relationship("CanalVenta", back_populates="ventas", lazy='selectin')
    referidor_id = Column(Integer, ForeignKey('referidores.id'), nullable=True)
    referidor_rel = relationship("Referidor", lazy='selectin')
    comision_monto = Column(Float, default=0.0)
    comision_pagada = Column(Boolean, default=False)
    pagos = relationship("Pago", back_populates="venta_rel", cascade="all, delete-orphan", lazy='selectin')
    ajustes = relationship("AjusteVenta", back_populates="venta_rel", cascade="all, delete-orphan", lazy='selectin')
    requiere_compra = Column(Boolean, default=True)
    es_credito = Column(Boolean, default=False)


class Pago(TimestampMixin, Base):
    __tablename__ = 'pagos'
    __table_args__ = (
        Index('idx_pago_fecha', 'fecha'),
        Index('idx_pago_venta', 'venta_id'),
        Index('idx_pago_venta_fecha', 'venta_id', 'fecha'),
        Index('idx_pago_grupo_fecha', 'grupo_pago_id', 'fecha'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    venta_id = Column(Integer, ForeignKey('ventas.id'), nullable=False)
    venta_rel = relationship("Venta", back_populates="pagos", lazy='selectin')
    fecha = Column(DateTime, default=datetime.now)
    monto = Column(Float, nullable=False)
    metodo_pago = Column(String(50))
    nota = Column(String(255), nullable=True)
    banco_id = Column(Integer, ForeignKey('bancos.id'), nullable=True)
    banco_rel = relationship("Banco", back_populates="pagos", lazy='selectin')
    grupo_pago_id = Column(String(50), nullable=True)


class AjusteVenta(TimestampMixin, Base):
    __tablename__ = 'ajustes_venta'
    id = Column(Integer, primary_key=True, autoincrement=True)
    venta_id = Column(Integer, ForeignKey('ventas.id'), nullable=False)
    venta_rel = relationship("Venta", back_populates="ajustes", lazy='selectin')
    fecha = Column(DateTime, default=datetime.now)
    monto = Column(Float, nullable=False)
    motivo = Column(Text, nullable=False)
    tipo = Column(String(50), default='DESCUENTO')
    tipo_distribucion = Column(String(20), default='PROPORCIONAL')
    usuario = Column(String(100))
    items_ajuste = relationship("AjusteVentaItem", back_populates="ajuste_rel", cascade="all, delete-orphan", lazy='selectin')


class AjusteVentaItem(TimestampMixin, Base):
    __tablename__ = 'ajustes_venta_items'
    id = Column(Integer, primary_key=True, autoincrement=True)
    ajuste_id = Column(Integer, ForeignKey('ajustes_venta.id'), nullable=False)
    ajuste_rel = relationship("AjusteVenta", back_populates="items_ajuste", lazy='selectin')
    item_id = Column(Integer, ForeignKey('presupuesto_items.id'), nullable=False)
    item_rel = relationship("PresupuestoItem", lazy='selectin')
    monto_descuento = Column(Float, nullable=False)


class Comision(TimestampMixin, Base):
    __tablename__ = 'comisiones'
    __table_args__ = (
        Index('idx_comision_fecha', 'fecha'),
        Index('idx_comision_referidor', 'referidor_id'),
        Index('idx_comision_estado', 'estado'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    referidor_id = Column(Integer, ForeignKey('referidores.id'), nullable=False)
    referidor_rel = relationship("Referidor", back_populates="comisiones", lazy='selectin')
    monto = Column(Float, nullable=False)
    fecha = Column(DateTime, default=datetime.now)
    estado = Column(String(20), default='PENDIENTE')
    descripcion = Column(Text)
    venta_id = Column(Integer, ForeignKey('ventas.id'), nullable=True)
    venta_rel = relationship("Venta", lazy='selectin')
    movimiento_banco_id = Column(Integer, ForeignKey('movimientos_banco.id'), nullable=True)
    movimiento_caja_id = Column(Integer, ForeignKey('movimientos_caja.id'), nullable=True)


# ─── Bancos ────────────────────────────────────────────────────────────────────

class Banco(TimestampMixin, Base):
    __tablename__ = 'bancos'
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre_banco = Column(String(100), nullable=False)
    numero_cuenta = Column(String(50), nullable=False)
    titular = Column(String(100), nullable=False)
    tipo_cuenta = Column(String(50))
    saldo_actual = Column(Float, default=0.0)
    porcentaje_comision = Column(Float, default=3.3)
    pagos = relationship("Pago", back_populates="banco_rel", lazy='selectin')
    pagos_compras = relationship("PagoCompra", back_populates="banco_rel", lazy='selectin')
    movimientos = relationship("MovimientoBanco", back_populates="banco_rel", cascade="all, delete-orphan", lazy='selectin')


class MovimientoBanco(TimestampMixin, Base):
    __tablename__ = 'movimientos_banco'
    __table_args__ = (
        Index('idx_mov_banco_fecha', 'fecha'),
        Index('idx_mov_banco_tipo', 'tipo'),
        Index('idx_mov_banco_banco_id', 'banco_id'),
        Index('idx_mov_banco_banco_fecha', 'banco_id', 'fecha'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    banco_id = Column(Integer, ForeignKey('bancos.id'), nullable=False)
    banco_rel = relationship("Banco", back_populates="movimientos", lazy='selectin')
    fecha = Column(DateTime, default=datetime.now)
    tipo = Column(String(20), nullable=False)
    monto = Column(Float, nullable=False)
    concepto = Column(String(255))
    saldo_anterior = Column(Float, nullable=False)
    saldo_nuevo = Column(Float, nullable=False)
    pago_venta_id = Column(Integer, ForeignKey('pagos.id'), nullable=True)
    pago_venta_rel = relationship("Pago", lazy='selectin', foreign_keys=[pago_venta_id])
    pago_compra_id = Column(Integer, ForeignKey('pagos_compras.id'), nullable=True)
    pago_compra_rel = relationship("PagoCompra", lazy='selectin', foreign_keys=[pago_compra_id])
    gasto_operativo_id = Column(Integer, ForeignKey('gastos_operativos.id'), nullable=True)
    grupo_pago_id = Column(String(50), nullable=True)
    jornada_id = Column(Integer, ForeignKey('jornadas_financieras.id'), nullable=True)


# ─── Compras ───────────────────────────────────────────────────────────────────

class CompraVenta(TimestampMixin, Base):
    __tablename__ = 'compra_ventas'
    id = Column(Integer, primary_key=True, autoincrement=True)
    compra_id = Column(Integer, ForeignKey('compras.id'), nullable=False)
    venta_id = Column(Integer, ForeignKey('ventas.id'), nullable=False)
    compra_rel = relationship("Compra", back_populates="ventas_asociadas", lazy='selectin')
    venta_rel = relationship("Venta", lazy='selectin')


class Compra(TimestampMixin, Base):
    __tablename__ = 'compras'
    __table_args__ = (
        Index('idx_compra_fecha', 'fecha'),
        Index('idx_compra_estado', 'estado'),
        Index('idx_compra_proveedor', 'proveedor_id'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    proveedor_id = Column(Integer, ForeignKey('proveedores.id'), nullable=True)
    proveedor_rel = relationship("Proveedor", lazy='selectin')
    fecha = Column(DateTime, default=datetime.now)
    tipo_documento = Column(String(50), nullable=False)
    nro_factura = Column(String(50), nullable=True)
    tipo_documento_original = Column(String(50), nullable=True)
    nro_documento_original = Column(String(50), nullable=True)
    total = Column(Float, default=0.0)
    saldo = Column(Float, default=0.0)
    estado = Column(String(20), default='PENDIENTE')
    observaciones = Column(Text)
    venta_id = Column(Integer, ForeignKey('ventas.id'), nullable=True)
    venta_rel = relationship("Venta", foreign_keys=[venta_id], lazy='selectin')
    cliente_id = Column(Integer, ForeignKey('clientes.id'), nullable=True)
    cliente_rel = relationship("Cliente", lazy='selectin')
    estado_entrega = Column(String(20), default='RECIBIDO')
    tipo_compra = Column(String(20), default='ORIGINAL')
    condicion_pago = Column(String(20), default='CONTADO')
    fecha_vencimiento = Column(DateTime, nullable=True)
    items = relationship("CompraDetalle", back_populates="compra_rel", cascade="all, delete-orphan", lazy='selectin')
    pagos = relationship("PagoCompra", back_populates="compra_rel", cascade="all, delete-orphan", lazy='selectin')
    ventas_asociadas = relationship("CompraVenta", back_populates="compra_rel", cascade="all, delete-orphan", lazy='selectin')


class CompraDetalle(TimestampMixin, Base):
    __tablename__ = 'compra_detalles'
    id = Column(Integer, primary_key=True, autoincrement=True)
    compra_id = Column(Integer, ForeignKey('compras.id'), nullable=False)
    compra_rel = relationship("Compra", back_populates="items", lazy='selectin')
    producto_id = Column(Integer, ForeignKey('productos.id'), nullable=True)
    producto_rel = relationship("Producto", lazy='selectin')
    descripcion = Column(String(255), nullable=False)
    cantidad = Column(Integer, default=1)
    costo_unitario = Column(Float, nullable=False)
    iva = Column(Integer, default=10)
    descuento = Column(Float, default=0.0)
    subtotal = Column(Float, nullable=False)
    presupuesto_item_id = Column(Integer, ForeignKey('presupuesto_items.id'), nullable=True)
    presupuesto_item_rel = relationship("PresupuestoItem", lazy='selectin')


class PagoCompra(TimestampMixin, Base):
    __tablename__ = 'pagos_compras'
    __table_args__ = (
        Index('idx_pago_compra_fecha', 'fecha'),
        Index('idx_pago_compra_id_ref', 'compra_id'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    compra_id = Column(Integer, ForeignKey('compras.id'), nullable=False)
    compra_rel = relationship("Compra", back_populates="pagos", lazy='selectin')
    fecha = Column(DateTime, default=datetime.now)
    monto = Column(Float, nullable=False)
    metodo_pago = Column(String(50))
    banco_id = Column(Integer, ForeignKey('bancos.id'), nullable=True)
    banco_rel = relationship("Banco", lazy='selectin')
    nro_factura_asignada = Column(String(50), nullable=True)
    nro_comprobante = Column(String(50), nullable=True)
    lote_pago_id = Column(String(36), nullable=True)
    estado = Column(String(20), default='ACTIVO')


# ─── Gastos & Caja ─────────────────────────────────────────────────────────────

class CategoriaGasto(TimestampMixin, Base):
    __tablename__ = 'categorias_gasto'
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), unique=True, nullable=False)
    descripcion = Column(Text)
    categoria_padre_id = Column(Integer, ForeignKey('categorias_gasto.id'), nullable=True)
    gastos = relationship("GastoOperativo", back_populates="categoria_rel", lazy='selectin')
    categoria_padre = relationship("CategoriaGasto", remote_side=[id], backref="subcategorias")


class GastoOperativo(TimestampMixin, Base):
    __tablename__ = 'gastos_operativos'
    __table_args__ = (
        Index('idx_gasto_fecha', 'fecha'),
        Index('idx_gasto_categoria', 'categoria_id'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    fecha = Column(DateTime, default=datetime.now)
    categoria_id = Column(Integer, ForeignKey('categorias_gasto.id'), nullable=False)
    categoria_rel = relationship("CategoriaGasto", back_populates="gastos", lazy='selectin')
    monto = Column(Float, nullable=False)
    concepto = Column(String(255), nullable=False)
    comprobante = Column(String(100))
    metodo_pago = Column(String(50))
    movimiento_caja_id = Column(Integer, ForeignKey('movimientos_caja.id'), nullable=True)
    movimiento_banco_id = Column(Integer, ForeignKey('movimientos_banco.id'), nullable=True)
    banco_id = Column(Integer, ForeignKey('bancos.id'), nullable=True)
    banco_rel = relationship("Banco", lazy='selectin')


class JornadaFinanciera(TimestampMixin, Base):
    __tablename__ = 'jornadas_financieras'
    __table_args__ = (
        Index('idx_jornada_financiera_fecha', 'fecha'),
        Index('idx_jornada_financiera_estado', 'estado'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    fecha = Column(Date, nullable=False, unique=True)
    estado = Column(String(20), nullable=False, default='ABIERTA')
    fecha_hora_apertura = Column(DateTime, default=datetime.now, nullable=False)
    usuario_apertura_id = Column(Integer, ForeignKey('usuarios.id'), nullable=True)
    usuario_apertura_nombre = Column(String(100), nullable=True)
    observacion_apertura = Column(Text, nullable=True)


class DestinatarioRendicion(TimestampMixin, Base):
    """Personas autorizadas a recibir rendiciones de caja (catálogo por tenant)."""
    __tablename__ = 'destinatarios_rendicion'
    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(150), unique=True, nullable=False)
    activo = Column(Boolean, nullable=False, default=True)


class CorteJornadaFinanciera(TimestampMixin, Base):
    __tablename__ = 'cortes_jornada_financiera'
    __table_args__ = (
        Index('idx_corte_jornada_fecha_hora', 'fecha_hora_corte'),
        Index('idx_corte_jornada_jornada_id', 'jornada_id'),
        Index('idx_corte_jornada_jornada_fecha', 'jornada_id', 'fecha_hora_corte'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    jornada_id = Column(Integer, ForeignKey('jornadas_financieras.id'), nullable=False)
    fecha_hora_corte = Column(DateTime, default=datetime.now, nullable=False)
    usuario_id = Column(Integer, ForeignKey('usuarios.id'), nullable=True)
    usuario_nombre = Column(String(100), nullable=True)
    ingresos = Column(Float, default=0.0, nullable=False)
    egresos = Column(Float, default=0.0, nullable=False)
    neto = Column(Float, default=0.0, nullable=False)
    movimientos_caja = Column(Integer, default=0, nullable=False)
    movimientos_banco = Column(Integer, default=0, nullable=False)
    movimientos_total = Column(Integer, default=0, nullable=False)
    saldo_actual_caja = Column(Float, default=0.0, nullable=False)
    saldo_actual_bancos = Column(Float, default=0.0, nullable=False)
    saldo_final_total = Column(Float, default=0.0, nullable=False)


class RendicionJornadaFinanciera(TimestampMixin, Base):
    __tablename__ = 'rendiciones_jornada_financiera'
    __table_args__ = (
        Index('idx_rendicion_jornada_fecha_hora', 'fecha_hora_rendicion'),
        Index('idx_rendicion_jornada_jornada_id', 'jornada_id'),
        Index('idx_rendicion_jornada_estado', 'estado'),
        Index('idx_rendicion_jornada_jornada_fecha', 'jornada_id', 'fecha_hora_rendicion'),
        Index('idx_rendicion_destinatario', 'destinatario_rendicion_id'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    jornada_id = Column(Integer, ForeignKey('jornadas_financieras.id'), nullable=False)
    fecha_hora_rendicion = Column(DateTime, default=datetime.now, nullable=False)
    usuario_id = Column(Integer, ForeignKey('usuarios.id'), nullable=True)
    usuario_nombre = Column(String(100), nullable=True)
    destinatario_rendicion_id = Column(Integer, ForeignKey('destinatarios_rendicion.id'), nullable=True)
    rendido_a = Column(String(150), nullable=False)
    monto_sugerido = Column(Float, default=0.0, nullable=False)
    monto_rendido = Column(Float, default=0.0, nullable=False)
    observacion = Column(Text, nullable=True)
    estado = Column(String(20), default='VIGENTE', nullable=False)
    rendicion_original_id = Column(Integer, ForeignKey('rendiciones_jornada_financiera.id'), nullable=True)
    fecha_hora_original = Column(DateTime, nullable=True)
    rendido_a_original = Column(String(150), nullable=True)
    monto_rendido_original = Column(Float, nullable=True)
    observacion_original = Column(Text, nullable=True)
    fecha_hora_ultima_edicion = Column(DateTime, nullable=True)
    usuario_ultima_edicion_id = Column(Integer, ForeignKey('usuarios.id'), nullable=True)
    usuario_ultima_edicion_nombre = Column(String(100), nullable=True)
    motivo_ajuste = Column(Text, nullable=True)


class MovimientoCaja(TimestampMixin, Base):
    __tablename__ = 'movimientos_caja'
    __table_args__ = (
        Index('idx_mov_caja_fecha', 'fecha'),
        Index('idx_mov_caja_tipo', 'tipo'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    fecha = Column(DateTime, default=datetime.now)
    tipo = Column(String(20), nullable=False)
    monto = Column(Float, nullable=False)
    concepto = Column(String(255))
    saldo_anterior = Column(Float, nullable=False)
    saldo_nuevo = Column(Float, nullable=False)
    pago_venta_id = Column(Integer, ForeignKey('pagos.id'), nullable=True)
    pago_venta_rel = relationship("Pago", lazy='selectin', foreign_keys=[pago_venta_id])
    pago_compra_id = Column(Integer, ForeignKey('pagos_compras.id'), nullable=True)
    pago_compra_rel = relationship("PagoCompra", lazy='selectin', foreign_keys=[pago_compra_id])
    deposito_banco_id = Column(Integer, ForeignKey('movimientos_banco.id'), nullable=True)
    gasto_operativo_id = Column(Integer, ForeignKey('gastos_operativos.id'), nullable=True)
    gasto_operativo_rel = relationship("GastoOperativo", lazy='selectin', foreign_keys=[gasto_operativo_id])
    jornada_id = Column(Integer, ForeignKey('jornadas_financieras.id'), nullable=True)


class ConfiguracionCaja(TimestampMixin, Base):
    __tablename__ = 'configuracion_caja'
    id = Column(Integer, primary_key=True)
    saldo_actual = Column(Float, default=0.0)


class ConfiguracionEmpresa(TimestampMixin, Base):
    __tablename__ = 'configuracion_empresa'
    id = Column(Integer, primary_key=True)
    nombre = Column(String(200))
    ruc = Column(String(50))
    direccion = Column(Text)
    telefono = Column(String(50))
    email = Column(String(100))
    logo_path = Column(String(255))
    business_timezone = Column(String(64), default="America/Asuncion")
    porcentaje_comision_tarjeta = Column(Float, default=3.3)


# ─── Usuarios del tenant ───────────────────────────────────────────────────────

class Usuario(TimestampMixin, Base):
    """Usuarios que acceden al sistema web de un cliente específico."""
    __tablename__ = 'usuarios'
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    nombre_completo = Column(String(100), nullable=False)
    rol = Column(String(20), default='USUARIO') # ADMIN, USUARIO, DOCTOR, CAJERO
    permisos_json = Column(Text, nullable=True)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime, default=datetime.utcnow)
    ultimo_acceso = Column(DateTime, nullable=True)
