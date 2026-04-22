from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Paciente(Base):
    __tablename__ = "clinica_pacientes"
    __table_args__ = (
        Index("idx_clinica_paciente_nombre", "nombre_completo"),
        Index("idx_clinica_paciente_ci", "ci_pasaporte"),
        Index("idx_clinica_paciente_cliente", "cliente_id"),
        Index("idx_clinica_paciente_referidor", "referidor_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre_completo = Column(String(200), nullable=False)
    fecha_nacimiento = Column(Date, nullable=True)
    edad_manual = Column(Integer, nullable=True)
    ci_pasaporte = Column(String(50), unique=True, nullable=True)
    telefono = Column(String(50))
    direccion = Column(Text)
    antecedentes_oculares = Column(Text)
    notas = Column(Text)
    fecha_registro = Column(DateTime, default=datetime.now)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True)
    referidor_id = Column(Integer, ForeignKey("referidores.id"), nullable=True)

    cliente_rel = relationship("Cliente", foreign_keys=[cliente_id], lazy="selectin")
    referidor_rel = relationship("Referidor", foreign_keys=[referidor_id], lazy="selectin")
    consultas_oftalmologicas = relationship(
        "ConsultaOftalmologica",
        back_populates="paciente_rel",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    consultas_contactologia = relationship(
        "ConsultaContactologia",
        back_populates="paciente_rel",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    cuestionarios = relationship("Cuestionario", lazy="selectin")
    recetas_pdf = relationship(
        "RecetaPDF",
        back_populates="paciente_rel",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class Doctor(Base):
    __tablename__ = "clinica_doctores"
    __table_args__ = (
        Index("idx_clinica_doctor_nombre", "nombre_completo"),
        Index("idx_clinica_doctor_activo", "activo"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre_completo = Column(String(200), nullable=False)
    especialidad = Column(String(100))
    registro_profesional = Column(String(50))
    telefono = Column(String(50))
    email = Column(String(100))
    activo = Column(Boolean, default=True)

    consultas_oftalmologicas = relationship("ConsultaOftalmologica", back_populates="doctor_rel", lazy="selectin")
    consultas_contactologia = relationship("ConsultaContactologia", back_populates="doctor_rel", lazy="selectin")


class LugarAtencion(Base):
    __tablename__ = "clinica_lugares_atencion"
    __table_args__ = (
        Index("idx_clinica_lugar_nombre", "nombre"),
        Index("idx_clinica_lugar_activo", "activo"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(200), nullable=False)
    direccion = Column(String(300))
    telefono = Column(String(50))
    contacto_responsable = Column(String(150))
    email = Column(String(100))
    notas = Column(Text)
    activo = Column(Integer, default=1)
    fecha_creacion = Column(DateTime, default=datetime.now)

    consultas_oftalmologicas = relationship("ConsultaOftalmologica", back_populates="lugar_atencion_rel", lazy="selectin")
    consultas_contactologia = relationship("ConsultaContactologia", back_populates="lugar_atencion_rel", lazy="selectin")


class ConsultaOftalmologica(Base):
    __tablename__ = "clinica_consultas_oftalmologicas"
    __table_args__ = (
        Index("idx_clinica_consulta_oft_fecha", "fecha"),
        Index("idx_clinica_consulta_oft_paciente", "paciente_id"),
        Index("idx_clinica_consulta_oft_doctor", "doctor_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    paciente_id = Column(Integer, ForeignKey("clinica_pacientes.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("clinica_doctores.id"), nullable=True)
    lugar_atencion_id = Column(Integer, ForeignKey("clinica_lugares_atencion.id"), nullable=True)
    fecha = Column(DateTime, default=datetime.now)
    motivo = Column(Text)
    diagnostico = Column(Text)
    plan_tratamiento = Column(Text)
    tipo_lente = Column(String(100))
    material_lente = Column(String(100))
    tratamientos = Column(String(200))
    fecha_control = Column(Date)
    agenda_turno_id = Column(Integer, ForeignKey("clinica_turnos.id"), nullable=True)
    av_sc_lejos_od = Column(String(50))
    av_sc_lejos_oi = Column(String(50))
    av_cc_lejos_od = Column(String(50))
    av_cc_lejos_oi = Column(String(50))
    ref_od_esfera = Column(String(50))
    ref_od_cilindro = Column(String(50))
    ref_od_eje = Column(String(50))
    ref_od_adicion = Column(String(50))
    ref_oi_esfera = Column(String(50))
    ref_oi_cilindro = Column(String(50))
    ref_oi_eje = Column(String(50))
    ref_oi_adicion = Column(String(50))
    examen_refraccion = Column(Boolean, default=True)
    examen_biomicroscopia = Column(Boolean, default=False)
    examen_oftalmoscopia = Column(Boolean, default=False)
    examen_tonometria = Column(Boolean, default=False)
    examen_campo_visual = Column(Boolean, default=False)
    examen_oct = Column(Boolean, default=False)
    examen_retinografia = Column(Boolean, default=False)
    examen_paquimetria = Column(Boolean, default=False)
    examen_topografia = Column(Boolean, default=False)
    examen_gonioscopia = Column(Boolean, default=False)
    examen_angiofluoresceinografia = Column(Boolean, default=False)
    examen_cicloplegia = Column(Boolean, default=False)
    biomicroscopia_parpados = Column(Text)
    biomicroscopia_conjuntiva = Column(Text)
    biomicroscopia_cornea = Column(Text)
    biomicroscopia_camara_anterior = Column(Text)
    biomicroscopia_iris = Column(Text)
    biomicroscopia_cristalino = Column(Text)
    tonometria_od = Column(String(50))
    tonometria_oi = Column(String(50))
    tonometria_metodo = Column(String(100))
    campo_visual_tipo = Column(String(100))
    campo_visual_od = Column(Text)
    campo_visual_oi = Column(Text)
    oct_tipo = Column(String(100))
    oct_hallazgos = Column(Text)
    retinografia_hallazgos = Column(Text)
    paquimetria_od = Column(String(50))
    paquimetria_oi = Column(String(50))
    topografia_tipo = Column(String(100))
    topografia_hallazgos = Column(Text)
    gonioscopia_od = Column(String(50))
    gonioscopia_oi = Column(String(50))
    gonioscopia_hallazgos = Column(Text)
    angiofluoresceinografia_hallazgos = Column(Text)
    cicloplegia_medicamento = Column(String(100))
    cicloplegia_dosis = Column(String(100))
    cicloplegia_od_esfera = Column(String(50))
    cicloplegia_od_cilindro = Column(String(50))
    cicloplegia_od_eje = Column(String(50))
    cicloplegia_oi_esfera = Column(String(50))
    cicloplegia_oi_cilindro = Column(String(50))
    cicloplegia_oi_eje = Column(String(50))
    estudios_solicitados = Column(Text)
    observaciones = Column(Text)

    paciente_rel = relationship("Paciente", back_populates="consultas_oftalmologicas", lazy="selectin")
    doctor_rel = relationship("Doctor", back_populates="consultas_oftalmologicas", lazy="selectin")
    lugar_atencion_rel = relationship("LugarAtencion", back_populates="consultas_oftalmologicas", lazy="selectin")


class ConsultaContactologia(Base):
    __tablename__ = "clinica_consultas_contactologia"
    __table_args__ = (
        Index("idx_clinica_consulta_cont_fecha", "fecha"),
        Index("idx_clinica_consulta_cont_paciente", "paciente_id"),
        Index("idx_clinica_consulta_cont_doctor", "doctor_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    paciente_id = Column(Integer, ForeignKey("clinica_pacientes.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("clinica_doctores.id"), nullable=True)
    lugar_atencion_id = Column(Integer, ForeignKey("clinica_lugares_atencion.id"), nullable=True)
    fecha = Column(DateTime, default=datetime.now)
    tipo_lente = Column(String(100))
    diseno = Column(String(100))
    diagnostico = Column(Text)
    plan_tratamiento = Column(Text)
    resumen_resultados = Column(Text)
    marca_recomendada = Column(String(200))
    fecha_control = Column(Date)
    agenda_turno_id = Column(Integer, ForeignKey("clinica_turnos.id"), nullable=True)
    observaciones = Column(Text)

    paciente_rel = relationship("Paciente", back_populates="consultas_contactologia", lazy="selectin")
    doctor_rel = relationship("Doctor", back_populates="consultas_contactologia", lazy="selectin")
    lugar_atencion_rel = relationship("LugarAtencion", back_populates="consultas_contactologia", lazy="selectin")


class Cuestionario(Base):
    __tablename__ = "clinica_cuestionarios"
    __table_args__ = (
        Index("idx_clinica_cuestionario_paciente", "paciente_id"),
        Index("idx_clinica_cuestionario_fecha", "fecha"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    paciente_id = Column(Integer, ForeignKey("clinica_pacientes.id"), nullable=False)
    fecha = Column(DateTime, default=datetime.now)
    motivo_principal = Column(Text)
    tiempo_molestias = Column(String(100))
    expectativa = Column(Text)
    horas_pantalla = Column(String(50))
    conduce = Column(String(50))
    actividad_laboral = Column(String(100))
    hobbies = Column(Text)
    cefalea = Column(Boolean, default=False)
    ardor = Column(Boolean, default=False)
    ojo_seco = Column(Boolean, default=False)
    lagrimeo = Column(Boolean, default=False)
    fotofobia = Column(Boolean, default=False)
    vision_doble = Column(Boolean, default=False)
    destellos = Column(Boolean, default=False)
    manchas = Column(Boolean, default=False)
    dificultad_cerca = Column(Boolean, default=False)
    diabetes = Column(Boolean, default=False)
    diabetes_controlada = Column(Boolean, default=True)
    hipertension = Column(Boolean, default=False)
    alergias = Column(Boolean, default=False)
    migranas = Column(Boolean, default=False)
    cirugias_previas = Column(Boolean, default=False)
    trauma_ocular = Column(Boolean, default=False)
    medicamentos = Column(Text)
    antecedentes_familiares = Column(Text)
    usa_anteojos = Column(Boolean, default=False)
    proposito_anteojos = Column(String(100))
    graduacion_anterior_od_esfera = Column(String(50))
    graduacion_anterior_od_cilindro = Column(String(50))
    graduacion_anterior_od_eje = Column(String(50))
    graduacion_anterior_od_adicion = Column(String(50))
    graduacion_anterior_oi_esfera = Column(String(50))
    graduacion_anterior_oi_cilindro = Column(String(50))
    graduacion_anterior_oi_eje = Column(String(50))
    graduacion_anterior_oi_adicion = Column(String(50))
    usa_lentes_contacto = Column(Boolean, default=False)
    tipo_lentes_contacto = Column(String(50))
    horas_uso_lc = Column(String(50))
    molestias_lc = Column(Boolean, default=False)


class RecetaPDF(Base):
    __tablename__ = "clinica_recetas_pdf"
    __table_args__ = (
        Index("idx_clinica_receta_pdf_paciente", "paciente_id"),
        Index("idx_clinica_receta_pdf_fecha", "fecha"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    paciente_id = Column(Integer, ForeignKey("clinica_pacientes.id"), nullable=False)
    consulta_oftalmologica_id = Column(Integer, ForeignKey("clinica_consultas_oftalmologicas.id"), nullable=True)
    consulta_contactologia_id = Column(Integer, ForeignKey("clinica_consultas_contactologia.id"), nullable=True)
    tipo = Column(String(50), nullable=False)
    fecha = Column(DateTime, default=datetime.now)
    archivo_pdf_path = Column(String(255))

    paciente_rel = relationship("Paciente", back_populates="recetas_pdf", lazy="selectin")


class RecetaMedicamento(Base):
    __tablename__ = "clinica_receta_medicamentos"
    __table_args__ = (
        Index("idx_clinica_receta_med_paciente", "paciente_id"),
        Index("idx_clinica_receta_med_fecha", "fecha_emision"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    paciente_id = Column(Integer, ForeignKey("clinica_pacientes.id"), nullable=False)
    consulta_id = Column(Integer, nullable=True)
    consulta_tipo = Column(String(30), nullable=True)
    fecha_emision = Column(DateTime, default=datetime.now, nullable=False)
    doctor_nombre = Column(String(200))
    diagnostico = Column(Text)
    observaciones = Column(Text)

    detalles_medicamentos = relationship(
        "RecetaMedicamentoDetalle",
        back_populates="receta_rel",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class RecetaMedicamentoDetalle(Base):
    __tablename__ = "clinica_receta_medicamentos_detalles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    receta_id = Column(Integer, ForeignKey("clinica_receta_medicamentos.id"), nullable=False)
    medicamento_id = Column(Integer, ForeignKey("vademecum_medicamentos.id"), nullable=False)
    posologia_personalizada = Column(Text)
    duracion_tratamiento = Column(String(100))

    receta_rel = relationship("RecetaMedicamento", back_populates="detalles_medicamentos", lazy="selectin")
    medicamento_rel = relationship("VademecumMedicamento", lazy="selectin")


class VademecumMedicamento(Base):
    __tablename__ = "vademecum_medicamentos"
    __table_args__ = (
        Index("idx_vademecum_medicamento_nombre", "nombre_comercial"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre_comercial = Column(String(100), nullable=False, unique=True)
    droga = Column(String(200))
    presentacion = Column(String(100))
    laboratorio = Column(String(100))
    indicaciones = Column(Text)
    contraindicaciones = Column(Text)
    posologia_habitual = Column(Text)
    notas = Column(Text)

    tratamientos = relationship("VademecumTratamiento", back_populates="medicamento_rel", cascade="all, delete-orphan", lazy="selectin")


class VademecumPatologia(Base):
    __tablename__ = "vademecum_patologias"
    __table_args__ = (
        Index("idx_vademecum_patologia_nombre", "nombre"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), nullable=False, unique=True)
    descripcion = Column(Text)
    sintomas = Column(Text)
    tratamiento_no_farmacologico = Column(Text)

    tratamientos = relationship("VademecumTratamiento", back_populates="patologia_rel", cascade="all, delete-orphan", lazy="selectin")


class VademecumTratamiento(Base):
    __tablename__ = "vademecum_tratamientos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patologia_id = Column(Integer, ForeignKey("vademecum_patologias.id"), nullable=False)
    medicamento_id = Column(Integer, ForeignKey("vademecum_medicamentos.id"), nullable=False)
    posologia_recomendada = Column(Text)

    patologia_rel = relationship("VademecumPatologia", back_populates="tratamientos", lazy="selectin")
    medicamento_rel = relationship("VademecumMedicamento", back_populates="tratamientos", lazy="selectin")


class TurnoClinico(Base):
    __tablename__ = "clinica_turnos"
    __table_args__ = (
        Index("idx_clinica_turno_fecha_hora", "fecha_hora"),
        Index("idx_clinica_turno_estado", "estado"),
        Index("idx_clinica_turno_doctor", "doctor_id"),
        Index("idx_clinica_turno_lugar", "lugar_atencion_id"),
        Index("idx_clinica_turno_paciente", "paciente_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    paciente_id = Column(Integer, ForeignKey("clinica_pacientes.id"), nullable=True)
    paciente_nombre_libre = Column(String(200), nullable=True)
    paciente_telefono_libre = Column(String(50), nullable=True)
    doctor_id = Column(Integer, ForeignKey("clinica_doctores.id"), nullable=True)
    lugar_atencion_id = Column(Integer, ForeignKey("clinica_lugares_atencion.id"), nullable=True)
    fecha_hora = Column(DateTime, default=datetime.now, nullable=False)
    estado = Column(String(30), default="PENDIENTE", nullable=False)
    es_control = Column(Boolean, default=False, nullable=False)
    recordado_15 = Column(Boolean, default=False, nullable=False)
    recordado_8 = Column(Boolean, default=False, nullable=False)
    recordado_hoy = Column(Boolean, default=False, nullable=False)
    consulta_id = Column(Integer, nullable=True)
    consulta_tipo = Column(String(30), nullable=True)
    motivo = Column(String(255))
    notas = Column(Text)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    paciente_rel = relationship("Paciente", lazy="selectin")
    doctor_rel = relationship("Doctor", lazy="selectin")
    lugar_atencion_rel = relationship("LugarAtencion", lazy="selectin")
