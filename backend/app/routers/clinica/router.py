from datetime import date, datetime, timedelta
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, text
from sqlalchemy.orm import noload, selectinload

from app.database import get_session_for_tenant
from app.middleware.tenant import get_tenant_slug
from app.models.clinica_models import (
    ConsultaContactologia,
    ConsultaOftalmologica,
    Cuestionario,
    Doctor,
    LugarAtencion,
    Paciente,
    RecetaMedicamento,
    RecetaMedicamentoDetalle,
    RecetaPDF,
    VademecumMedicamento,
    VademecumPatologia,
    VademecumTratamiento,
)
from app.models.models import Cliente, Referidor
from app.schemas.schemas import ClinicaAlertOut, ClinicaDashboardResumenOut, ClinicaRecentConsultaOut
from app.schemas.schemas import (
    ClinicaConsultaContactologiaIn,
    ClinicaConsultaDetalleOut,
    ClinicaHistorialGeneralItemOut,
    ClinicaHistorialGeneralOut,
    ClinicaConsultaHistorialOut,
    ClinicaConsultaOftalmologicaIn,
    ClinicaCuestionarioIn,
    ClinicaCuestionarioOut,
    ClinicaDoctorIn,
    ClinicaDoctorOut,
    ClinicaDoctoresListOut,
    ClinicaDoctorSimpleOut,
    ClinicaLugarIn,
    ClinicaLugaresListOut,
    ClinicaLugarOut,
    ClinicaLugarSimpleOut,
    ClinicaMedicamentoSimpleOut,
    ClinicaPatologiaSimpleOut,
    ClinicaPacienteCreateIn,
    ClinicaPacienteHistorialOut,
    ClinicaPacienteOut,
    ClinicaPacientesListOut,
    ClinicaPacienteUpdateIn,
    ClinicaRecetaMedicamentoDetalleHistorialOut,
    ClinicaRecetaMedicamentoHistorialOut,
    ClinicaRecetaMedicamentoIn,
    ClinicaRecetaMedicamentoOut,
    ClinicaVademecumMedicamentoIn,
    ClinicaVademecumMedicamentoOut,
    ClinicaVademecumMedicamentosListOut,
    ClinicaVademecumPatologiaIn,
    ClinicaVademecumPatologiaOut,
    ClinicaVademecumPatologiasListOut,
    ClinicaVademecumTratamientoOut,
)
from app.utils.auth import require_action, require_clinica
from app.utils.pdf_consulta_clinica_web import generar_pdf_consulta_clinica
from app.utils.pdf_indicaciones_clinica import generar_pdf_indicaciones_clinica
from app.utils.pdf_receta_medicamento_clinica import (
    generar_pdf_receta_medicamento_clinica,
    generar_pdf_receta_medicamento_compra_clinica,
    generar_pdf_receta_medicamento_indicaciones_clinica,
)

router = APIRouter(prefix="/api/clinica", tags=["Clinica"])


def _inicio_mes(actual: date) -> datetime:
    return datetime.combine(actual.replace(day=1), datetime.min.time())


def _inicio_dia(actual: date) -> datetime:
    return datetime.combine(actual, datetime.min.time())


def _count_rows(query) -> int:
    return query.scalar() or 0


def _calcular_edad(fecha_nacimiento, edad_manual) -> int | None:
    if fecha_nacimiento:
        hoy = date.today()
        return hoy.year - fecha_nacimiento.year - (
            (hoy.month, hoy.day) < (fecha_nacimiento.month, fecha_nacimiento.day)
        )
    return edad_manual


def _normalizar_texto(value):
    if value is None:
        return None
    text_value = str(value).strip()
    return text_value or None


def _serializar_vademecum_medicamento(session, medicamento):
    tratamientos_count = _count_rows(
        session.query(func.count(VademecumTratamiento.id)).filter(VademecumTratamiento.medicamento_id == medicamento.id)
    )
    recetas_count = _count_rows(
        session.query(func.count(RecetaMedicamentoDetalle.id)).filter(RecetaMedicamentoDetalle.medicamento_id == medicamento.id)
    )
    return ClinicaVademecumMedicamentoOut(
        id=medicamento.id,
        nombre_comercial=medicamento.nombre_comercial,
        droga=medicamento.droga,
        presentacion=medicamento.presentacion,
        laboratorio=medicamento.laboratorio,
        indicaciones=medicamento.indicaciones,
        contraindicaciones=medicamento.contraindicaciones,
        posologia_habitual=medicamento.posologia_habitual,
        notas=medicamento.notas,
        tratamientos_count=tratamientos_count,
        recetas_count=recetas_count,
    )


def _serializar_vademecum_patologia(patologia):
    tratamientos = []
    for tratamiento in (patologia.tratamientos or []):
        tratamientos.append(
            ClinicaVademecumTratamientoOut(
                id=tratamiento.id,
                medicamento_id=tratamiento.medicamento_id,
                medicamento_nombre=(tratamiento.medicamento_rel.nombre_comercial if tratamiento.medicamento_rel else "MEDICAMENTO"),
                posologia_recomendada=tratamiento.posologia_recomendada,
            )
        )
    return ClinicaVademecumPatologiaOut(
        id=patologia.id,
        nombre=patologia.nombre,
        descripcion=patologia.descripcion,
        sintomas=patologia.sintomas,
        tratamiento_no_farmacologico=patologia.tratamiento_no_farmacologico,
        tratamientos=tratamientos,
    )


def _serializar_pacientes(session, pacientes):
    if not pacientes:
        return []

    paciente_ids = [paciente.id for paciente in pacientes]

    oft_rows = (
        session.query(
            ConsultaOftalmologica.paciente_id,
            func.count(ConsultaOftalmologica.id),
            func.max(ConsultaOftalmologica.fecha),
        )
        .filter(ConsultaOftalmologica.paciente_id.in_(paciente_ids))
        .group_by(ConsultaOftalmologica.paciente_id)
        .all()
    )
    cont_rows = (
        session.query(
            ConsultaContactologia.paciente_id,
            func.count(ConsultaContactologia.id),
            func.max(ConsultaContactologia.fecha),
        )
        .filter(ConsultaContactologia.paciente_id.in_(paciente_ids))
        .group_by(ConsultaContactologia.paciente_id)
        .all()
    )

    oft_map = {row[0]: {"count": row[1] or 0, "max": row[2]} for row in oft_rows}
    cont_map = {row[0]: {"count": row[1] or 0, "max": row[2]} for row in cont_rows}

    items = []
    for paciente in pacientes:
        oft_info = oft_map.get(paciente.id, {"count": 0, "max": None})
        cont_info = cont_map.get(paciente.id, {"count": 0, "max": None})
        ultima_consulta = max(
            [fecha for fecha in [oft_info["max"], cont_info["max"]] if fecha is not None],
            default=None,
        )
        items.append(
            ClinicaPacienteOut(
                id=paciente.id,
                nombre_completo=paciente.nombre_completo,
                fecha_nacimiento=paciente.fecha_nacimiento,
                edad_manual=paciente.edad_manual,
                edad_calculada=_calcular_edad(paciente.fecha_nacimiento, paciente.edad_manual),
                ci_pasaporte=paciente.ci_pasaporte,
                telefono=paciente.telefono,
                direccion=paciente.direccion,
                antecedentes_oculares=paciente.antecedentes_oculares,
                notas=paciente.notas,
                fecha_registro=paciente.fecha_registro,
                cliente_id=paciente.cliente_id,
                referidor_id=getattr(paciente, "referidor_id", None),
                referidor_nombre=paciente.referidor_rel.nombre if getattr(paciente, "referidor_rel", None) else None,
                es_cliente=bool(paciente.cliente_id),
                consultas_oftalmologicas=oft_info["count"],
                consultas_contactologia=cont_info["count"],
                ultima_consulta=ultima_consulta,
            )
        )
    return items


def _obtener_paciente_seguro(session, paciente_id: int):
    paciente = (
        session.query(Paciente)
        .options(
            noload(Paciente.consultas_oftalmologicas),
            noload(Paciente.consultas_contactologia),
            noload(Paciente.cuestionarios),
            noload(Paciente.recetas_pdf),
            selectinload(Paciente.cliente_rel),
            selectinload(Paciente.referidor_rel),
        )
        .filter(Paciente.id == paciente_id)
        .first()
    )
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado.")
    return paciente


def _serializar_doctores(session, doctores):
    if not doctores:
        return []

    doctor_ids = [doctor.id for doctor in doctores]
    oft_rows = (
        session.query(ConsultaOftalmologica.doctor_id, func.count(ConsultaOftalmologica.id))
        .filter(ConsultaOftalmologica.doctor_id.in_(doctor_ids))
        .group_by(ConsultaOftalmologica.doctor_id)
        .all()
    )
    cont_rows = (
        session.query(ConsultaContactologia.doctor_id, func.count(ConsultaContactologia.id))
        .filter(ConsultaContactologia.doctor_id.in_(doctor_ids))
        .group_by(ConsultaContactologia.doctor_id)
        .all()
    )
    oft_map = {row[0]: row[1] or 0 for row in oft_rows}
    cont_map = {row[0]: row[1] or 0 for row in cont_rows}

    return [
        ClinicaDoctorOut(
            id=doctor.id,
            nombre_completo=doctor.nombre_completo,
            especialidad=doctor.especialidad,
            registro_profesional=doctor.registro_profesional,
            telefono=doctor.telefono,
            email=doctor.email,
            activo=bool(doctor.activo),
            consultas_oftalmologicas=oft_map.get(doctor.id, 0),
            consultas_contactologia=cont_map.get(doctor.id, 0),
        )
        for doctor in doctores
    ]


def _serializar_lugares(session, lugares):
    if not lugares:
        return []

    lugar_ids = [lugar.id for lugar in lugares]
    oft_rows = (
        session.query(ConsultaOftalmologica.lugar_atencion_id, func.count(ConsultaOftalmologica.id))
        .filter(ConsultaOftalmologica.lugar_atencion_id.in_(lugar_ids))
        .group_by(ConsultaOftalmologica.lugar_atencion_id)
        .all()
    )
    cont_rows = (
        session.query(ConsultaContactologia.lugar_atencion_id, func.count(ConsultaContactologia.id))
        .filter(ConsultaContactologia.lugar_atencion_id.in_(lugar_ids))
        .group_by(ConsultaContactologia.lugar_atencion_id)
        .all()
    )
    oft_map = {row[0]: row[1] or 0 for row in oft_rows}
    cont_map = {row[0]: row[1] or 0 for row in cont_rows}

    return [
        ClinicaLugarOut(
            id=lugar.id,
            nombre=lugar.nombre,
            direccion=lugar.direccion,
            telefono=lugar.telefono,
            contacto_responsable=lugar.contacto_responsable,
            email=lugar.email,
            notas=lugar.notas,
            activo=bool(lugar.activo),
            consultas_oftalmologicas=oft_map.get(lugar.id, 0),
            consultas_contactologia=cont_map.get(lugar.id, 0),
            fecha_creacion=lugar.fecha_creacion,
        )
        for lugar in lugares
    ]

def _serializar_cuestionario(cuestionario):
    if not cuestionario:
        return None
    return ClinicaCuestionarioOut(
        id=cuestionario.id,
        paciente_id=cuestionario.paciente_id,
        fecha=cuestionario.fecha,
        motivo_principal=cuestionario.motivo_principal,
        tiempo_molestias=cuestionario.tiempo_molestias,
        expectativa=cuestionario.expectativa,
        horas_pantalla=cuestionario.horas_pantalla,
        conduce=cuestionario.conduce,
        actividad_laboral=cuestionario.actividad_laboral,
        hobbies=cuestionario.hobbies,
        cefalea=bool(cuestionario.cefalea),
        ardor=bool(cuestionario.ardor),
        ojo_seco=bool(cuestionario.ojo_seco),
        lagrimeo=bool(cuestionario.lagrimeo),
        fotofobia=bool(cuestionario.fotofobia),
        vision_doble=bool(cuestionario.vision_doble),
        destellos=bool(cuestionario.destellos),
        manchas=bool(cuestionario.manchas),
        dificultad_cerca=bool(cuestionario.dificultad_cerca),
        diabetes=bool(cuestionario.diabetes),
        diabetes_controlada=bool(cuestionario.diabetes_controlada),
        hipertension=bool(cuestionario.hipertension),
        alergias=bool(cuestionario.alergias),
        migranas=bool(cuestionario.migranas),
        cirugias_previas=bool(cuestionario.cirugias_previas),
        trauma_ocular=bool(cuestionario.trauma_ocular),
        medicamentos=cuestionario.medicamentos,
        antecedentes_familiares=cuestionario.antecedentes_familiares,
        usa_anteojos=bool(cuestionario.usa_anteojos),
        proposito_anteojos=cuestionario.proposito_anteojos,
        usa_lentes_contacto=bool(cuestionario.usa_lentes_contacto),
        tipo_lentes_contacto=cuestionario.tipo_lentes_contacto,
        horas_uso_lc=cuestionario.horas_uso_lc,
        molestias_lc=bool(cuestionario.molestias_lc),
    )


def _obtener_consulta_oft_segura(session, consulta_id: int):
    row = session.execute(
        text("SELECT * FROM clinica_consultas_oftalmologicas WHERE id = :consulta_id"),
        {"consulta_id": consulta_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Consulta oftalmologica no encontrada.")

    doctor_nombre = None
    lugar_nombre = None
    doctor_id = row.get("doctor_id")
    lugar_atencion_id = row.get("lugar_atencion_id")

    if doctor_id:
        doctor_nombre = session.query(Doctor.nombre_completo).filter(Doctor.id == doctor_id).scalar()
    if lugar_atencion_id:
        lugar_nombre = session.query(LugarAtencion.nombre).filter(LugarAtencion.id == lugar_atencion_id).scalar()
    recetas_relacionadas = _obtener_recetas_relacionadas(session, row.get("paciente_id"), consulta_id, "OFTALMOLOGIA")

    return ClinicaConsultaDetalleOut(
        id=row.get("id"),
        paciente_id=row.get("paciente_id"),
        tipo="OFTALMOLOGIA",
        fecha=row.get("fecha"),
        doctor_id=doctor_id,
        doctor_nombre=doctor_nombre,
        lugar_atencion_id=lugar_atencion_id,
        lugar_nombre=lugar_nombre,
        motivo=row.get("motivo"),
        diagnostico=row.get("diagnostico"),
        plan_tratamiento=row.get("plan_tratamiento"),
        tipo_lente=row.get("tipo_lente"),
        material_lente=row.get("material_lente"),
        tratamientos=row.get("tratamientos"),
        av_cc_lejos_od=row.get("av_cc_lejos_od"),
        av_cc_lejos_oi=row.get("av_cc_lejos_oi"),
        ref_od_esfera=row.get("ref_od_esfera"),
        ref_od_cilindro=row.get("ref_od_cilindro"),
        ref_od_eje=row.get("ref_od_eje"),
        ref_od_adicion=row.get("ref_od_adicion"),
        ref_oi_esfera=row.get("ref_oi_esfera"),
        ref_oi_cilindro=row.get("ref_oi_cilindro"),
        ref_oi_eje=row.get("ref_oi_eje"),
        ref_oi_adicion=row.get("ref_oi_adicion"),
        examen_refraccion=row.get("examen_refraccion"),
        examen_biomicroscopia=row.get("examen_biomicroscopia"),
        examen_oftalmoscopia=row.get("examen_oftalmoscopia"),
        examen_tonometria=row.get("examen_tonometria"),
        examen_campo_visual=row.get("examen_campo_visual"),
        examen_oct=row.get("examen_oct"),
        examen_retinografia=row.get("examen_retinografia"),
        examen_paquimetria=row.get("examen_paquimetria"),
        examen_topografia=row.get("examen_topografia"),
        examen_gonioscopia=row.get("examen_gonioscopia"),
        examen_angiofluoresceinografia=row.get("examen_angiofluoresceinografia"),
        examen_cicloplegia=row.get("examen_cicloplegia"),
        biomicroscopia_parpados=row.get("biomicroscopia_parpados"),
        biomicroscopia_conjuntiva=row.get("biomicroscopia_conjuntiva"),
        biomicroscopia_cornea=row.get("biomicroscopia_cornea"),
        biomicroscopia_camara_anterior=row.get("biomicroscopia_camara_anterior"),
        biomicroscopia_iris=row.get("biomicroscopia_iris"),
        biomicroscopia_cristalino=row.get("biomicroscopia_cristalino"),
        tonometria_od=row.get("tonometria_od"),
        tonometria_oi=row.get("tonometria_oi"),
        tonometria_metodo=row.get("tonometria_metodo"),
        campo_visual_tipo=row.get("campo_visual_tipo"),
        campo_visual_od=row.get("campo_visual_od"),
        campo_visual_oi=row.get("campo_visual_oi"),
        oct_tipo=row.get("oct_tipo"),
        oct_hallazgos=row.get("oct_hallazgos"),
        retinografia_hallazgos=row.get("retinografia_hallazgos"),
        paquimetria_od=row.get("paquimetria_od"),
        paquimetria_oi=row.get("paquimetria_oi"),
        topografia_tipo=row.get("topografia_tipo"),
        topografia_hallazgos=row.get("topografia_hallazgos"),
        gonioscopia_od=row.get("gonioscopia_od"),
        gonioscopia_oi=row.get("gonioscopia_oi"),
        gonioscopia_hallazgos=row.get("gonioscopia_hallazgos"),
        angiofluoresceinografia_hallazgos=row.get("angiofluoresceinografia_hallazgos"),
        cicloplegia_medicamento=row.get("cicloplegia_medicamento"),
        cicloplegia_dosis=row.get("cicloplegia_dosis"),
        cicloplegia_od_esfera=row.get("cicloplegia_od_esfera"),
        cicloplegia_od_cilindro=row.get("cicloplegia_od_cilindro"),
        cicloplegia_od_eje=row.get("cicloplegia_od_eje"),
        cicloplegia_oi_esfera=row.get("cicloplegia_oi_esfera"),
        cicloplegia_oi_cilindro=row.get("cicloplegia_oi_cilindro"),
        cicloplegia_oi_eje=row.get("cicloplegia_oi_eje"),
        estudios_solicitados=row.get("estudios_solicitados"),
        observaciones=row.get("observaciones"),
        tiene_receta_lentes_pdf=True,
        tiene_indicaciones_pdf=True,
        recetas_medicamentos_relacionadas=recetas_relacionadas,
    )


def _obtener_consulta_cont_segura(session, consulta_id: int):
    row = session.execute(
        text("SELECT * FROM clinica_consultas_contactologia WHERE id = :consulta_id"),
        {"consulta_id": consulta_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Consulta de contactologia no encontrada.")

    doctor_nombre = None
    lugar_nombre = None
    doctor_id = row.get("doctor_id")
    lugar_atencion_id = row.get("lugar_atencion_id")

    if doctor_id:
        doctor_nombre = session.query(Doctor.nombre_completo).filter(Doctor.id == doctor_id).scalar()
    if lugar_atencion_id:
        lugar_nombre = session.query(LugarAtencion.nombre).filter(LugarAtencion.id == lugar_atencion_id).scalar()
    recetas_relacionadas = _obtener_recetas_relacionadas(session, row.get("paciente_id"), consulta_id, "CONTACTOLOGIA")

    return ClinicaConsultaDetalleOut(
        id=row.get("id"),
        paciente_id=row.get("paciente_id"),
        tipo="CONTACTOLOGIA",
        fecha=row.get("fecha"),
        doctor_id=doctor_id,
        doctor_nombre=doctor_nombre,
        lugar_atencion_id=lugar_atencion_id,
        lugar_nombre=lugar_nombre,
        diagnostico=row.get("diagnostico"),
        plan_tratamiento=row.get("plan_tratamiento"),
        tipo_lente=row.get("tipo_lente"),
        diseno=row.get("diseno"),
        resumen_resultados=row.get("resumen_resultados"),
        marca_recomendada=row.get("marca_recomendada"),
        fecha_control=row.get("fecha_control"),
        observaciones=row.get("observaciones"),
        tiene_receta_lentes_pdf=False,
        tiene_indicaciones_pdf=True,
        recetas_medicamentos_relacionadas=recetas_relacionadas,
    )


def _obtener_receta_medicamento_segura(session, receta_id: int):
    receta = session.query(RecetaMedicamento).filter(RecetaMedicamento.id == receta_id).first()
    if not receta:
        raise HTTPException(status_code=404, detail="Receta de medicamentos no encontrada.")

    return ClinicaRecetaMedicamentoOut(
        id=receta.id,
        paciente_id=receta.paciente_id,
        consulta_id=receta.consulta_id,
        consulta_tipo=receta.consulta_tipo,
        fecha_emision=receta.fecha_emision,
        doctor_nombre=receta.doctor_nombre,
        diagnostico=receta.diagnostico,
        observaciones=receta.observaciones,
        detalles=[
            ClinicaRecetaMedicamentoDetalleHistorialOut(
                medicamento_id=detalle.medicamento_id,
                medicamento=(detalle.medicamento_rel.nombre_comercial if detalle.medicamento_rel else "MEDICAMENTO"),
                posologia_personalizada=detalle.posologia_personalizada,
                duracion_tratamiento=detalle.duracion_tratamiento,
            )
            for detalle in (receta.detalles_medicamentos or [])
        ],
    )


def _obtener_recetas_relacionadas(session, paciente_id: int, consulta_id: int, consulta_tipo: str):
    recetas = (
        session.query(RecetaMedicamento)
        .filter(
            RecetaMedicamento.paciente_id == paciente_id,
            RecetaMedicamento.consulta_id == consulta_id,
            RecetaMedicamento.consulta_tipo == consulta_tipo,
        )
        .order_by(RecetaMedicamento.fecha_emision.desc(), RecetaMedicamento.id.desc())
        .all()
    )
    return [
        {
            "id": receta.id,
            "fecha_emision": receta.fecha_emision,
            "doctor_nombre": receta.doctor_nombre,
            "diagnostico": receta.diagnostico,
            "observaciones": receta.observaciones,
        }
        for receta in recetas
    ]


@router.get("/dashboard/resumen", response_model=ClinicaDashboardResumenOut)
def obtener_dashboard_clinico(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_clinica),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        hoy = date.today()
        inicio_hoy = _inicio_dia(hoy)
        inicio_mes = _inicio_mes(hoy)
        inicio_semana = datetime.combine(hoy - timedelta(days=hoy.weekday()), datetime.min.time())

        total_pacientes = _count_rows(session.query(func.count(Paciente.id)))
        doctores_activos = _count_rows(session.query(func.count(Doctor.id)).filter(Doctor.activo.is_(True)))
        lugares_activos = _count_rows(session.query(func.count(LugarAtencion.id)).filter(LugarAtencion.activo == 1))

        consultas_oft_hoy = _count_rows(
            session.query(func.count(ConsultaOftalmologica.id)).filter(ConsultaOftalmologica.fecha >= inicio_hoy)
        )
        consultas_cont_hoy = _count_rows(
            session.query(func.count(ConsultaContactologia.id)).filter(ConsultaContactologia.fecha >= inicio_hoy)
        )
        consultas_hoy = consultas_oft_hoy + consultas_cont_hoy

        consultas_oft_semana = _count_rows(
            session.query(func.count(ConsultaOftalmologica.id)).filter(ConsultaOftalmologica.fecha >= inicio_semana)
        )
        consultas_cont_semana = _count_rows(
            session.query(func.count(ConsultaContactologia.id)).filter(ConsultaContactologia.fecha >= inicio_semana)
        )
        consultas_semana = consultas_oft_semana + consultas_cont_semana

        consultas_oft_mes = _count_rows(
            session.query(func.count(ConsultaOftalmologica.id)).filter(ConsultaOftalmologica.fecha >= inicio_mes)
        )
        consultas_cont_mes = _count_rows(
            session.query(func.count(ConsultaContactologia.id)).filter(ConsultaContactologia.fecha >= inicio_mes)
        )
        pacientes_nuevos_mes = _count_rows(session.query(func.count(Paciente.id)).filter(Paciente.fecha_registro >= inicio_mes))
        recetas_mes = (
            _count_rows(session.query(func.count(RecetaPDF.id)).filter(RecetaPDF.fecha >= inicio_mes))
            + _count_rows(session.query(func.count(RecetaMedicamento.id)).filter(RecetaMedicamento.fecha_emision >= inicio_mes))
        )

        recientes_oft = (
            session.query(
                ConsultaOftalmologica.id,
                ConsultaOftalmologica.fecha,
                ConsultaOftalmologica.paciente_id,
                ConsultaOftalmologica.motivo,
                ConsultaOftalmologica.diagnostico,
                ConsultaOftalmologica.plan_tratamiento,
                Paciente.nombre_completo.label("paciente_nombre"),
                Doctor.nombre_completo.label("doctor_nombre"),
                LugarAtencion.nombre.label("lugar_nombre"),
            )
            .outerjoin(Paciente, Paciente.id == ConsultaOftalmologica.paciente_id)
            .outerjoin(Doctor, Doctor.id == ConsultaOftalmologica.doctor_id)
            .outerjoin(LugarAtencion, LugarAtencion.id == ConsultaOftalmologica.lugar_atencion_id)
            .order_by(ConsultaOftalmologica.fecha.desc())
            .limit(5)
            .all()
        )
        recientes_cont = (
            session.query(
                ConsultaContactologia.id,
                ConsultaContactologia.fecha,
                ConsultaContactologia.paciente_id,
                ConsultaContactologia.diagnostico,
                ConsultaContactologia.resumen_resultados,
                ConsultaContactologia.tipo_lente,
                Paciente.nombre_completo.label("paciente_nombre"),
                Doctor.nombre_completo.label("doctor_nombre"),
                LugarAtencion.nombre.label("lugar_nombre"),
            )
            .outerjoin(Paciente, Paciente.id == ConsultaContactologia.paciente_id)
            .outerjoin(Doctor, Doctor.id == ConsultaContactologia.doctor_id)
            .outerjoin(LugarAtencion, LugarAtencion.id == ConsultaContactologia.lugar_atencion_id)
            .order_by(ConsultaContactologia.fecha.desc())
            .limit(5)
            .all()
        )

        recientes = []
        for consulta in recientes_oft:
            recientes.append(
                ClinicaRecentConsultaOut(
                    id=consulta.id,
                    fecha=consulta.fecha,
                    tipo="OFTALMOLOGIA",
                    paciente_id=consulta.paciente_id,
                    paciente_nombre=consulta.paciente_nombre or "SIN PACIENTE",
                    doctor_nombre=consulta.doctor_nombre,
                    lugar_nombre=consulta.lugar_nombre,
                    resumen=(consulta.motivo or consulta.diagnostico or consulta.plan_tratamiento or "")[:140] or None,
                )
            )
        for consulta in recientes_cont:
            recientes.append(
                ClinicaRecentConsultaOut(
                    id=consulta.id,
                    fecha=consulta.fecha,
                    tipo="CONTACTOLOGIA",
                    paciente_id=consulta.paciente_id,
                    paciente_nombre=consulta.paciente_nombre or "SIN PACIENTE",
                    doctor_nombre=consulta.doctor_nombre,
                    lugar_nombre=consulta.lugar_nombre,
                    resumen=(consulta.diagnostico or consulta.resumen_resultados or consulta.tipo_lente or "")[:140] or None,
                )
            )
        recientes.sort(key=lambda item: item.fecha, reverse=True)
        recientes = recientes[:6]

        alertas = []
        if consultas_hoy > 0:
            alertas.append(
                ClinicaAlertOut(
                    tipo="INFO",
                    titulo="Actividad del dia",
                    mensaje=f"Se registraron {consultas_hoy} consulta(s) clinicas hoy.",
                    color="#14b8a6",
                )
            )
        else:
            alertas.append(
                ClinicaAlertOut(
                    tipo="INFO",
                    titulo="Sin consultas hoy",
                    mensaje="Todavia no hay consultas registradas en la fecha actual.",
                    color="#64748b",
                )
            )

        if lugares_activos > 0:
            alertas.append(
                ClinicaAlertOut(
                    tipo="LUGAR",
                    titulo="Lugares de atencion activos",
                    mensaje=f"Hay {lugares_activos} lugar(es) de atencion disponibles.",
                    color="#22d3ee",
                )
            )

        if doctores_activos == 0:
            alertas.append(
                ClinicaAlertOut(
                    tipo="ATENCION",
                    titulo="Sin doctores activos",
                    mensaje="Conviene registrar o activar al menos un doctor antes de operar consultas.",
                    color="#f59e0b",
                )
            )

        return ClinicaDashboardResumenOut(
            total_pacientes=total_pacientes,
            doctores_activos=doctores_activos,
            consultas_hoy=consultas_hoy,
            consultas_semana=consultas_semana,
            recetas_mes=recetas_mes,
            pacientes_nuevos_mes=pacientes_nuevos_mes,
            lugares_activos=lugares_activos,
            consultas_oftalmologia_mes=consultas_oft_mes,
            consultas_contactologia_mes=consultas_cont_mes,
            recientes=recientes,
            alertas=alertas,
        )
    finally:
        session.close()


@router.get("/pacientes", response_model=ClinicaPacientesListOut)
def listar_pacientes_clinica(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.pacientes", "clinica")),
    buscar: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(Paciente)
        query = query.options(
            noload(Paciente.consultas_oftalmologicas),
            noload(Paciente.consultas_contactologia),
            noload(Paciente.cuestionarios),
            noload(Paciente.recetas_pdf),
            selectinload(Paciente.cliente_rel),
            selectinload(Paciente.referidor_rel),
        )
        if buscar:
            termino = f"%{buscar.strip()}%"
            query = query.filter(
                or_(
                    Paciente.nombre_completo.ilike(termino),
                    Paciente.ci_pasaporte.ilike(termino),
                    Paciente.telefono.ilike(termino),
                )
            )

        total = query.count()
        total_pages = max(1, ceil(total / page_size)) if total else 1
        pacientes = (
            query.order_by(Paciente.fecha_registro.desc(), Paciente.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        return ClinicaPacientesListOut(
            items=_serializar_pacientes(session, pacientes),
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    finally:
        session.close()


@router.get("/doctores/simple", response_model=list[ClinicaDoctorSimpleOut])
def listar_doctores_clinica_simple(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.doctores", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        rows = session.query(Doctor.id, Doctor.nombre_completo).filter(Doctor.activo.is_(True)).order_by(Doctor.nombre_completo.asc()).all()
        return [ClinicaDoctorSimpleOut(id=row.id, nombre_completo=row.nombre_completo) for row in rows]
    finally:
        session.close()


@router.get("/doctores", response_model=ClinicaDoctoresListOut)
def listar_doctores_clinica(
    buscar: str | None = Query(default=None),
    solo_activos: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.doctores", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(Doctor).options(
            noload(Doctor.consultas_oftalmologicas),
            noload(Doctor.consultas_contactologia),
        )
        if buscar:
            term = f"%{buscar.strip()}%"
            query = query.filter(
                or_(
                    Doctor.nombre_completo.ilike(term),
                    Doctor.especialidad.ilike(term),
                    Doctor.registro_profesional.ilike(term),
                    Doctor.telefono.ilike(term),
                    Doctor.email.ilike(term),
                )
            )
        if solo_activos:
            query = query.filter(Doctor.activo.is_(True))

        total = query.count()
        items = (
            query.order_by(Doctor.nombre_completo.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        total_pages = max(1, ceil(total / page_size)) if total else 1
        return ClinicaDoctoresListOut(
            items=_serializar_doctores(session, items),
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    finally:
        session.close()


@router.post("/doctores", response_model=ClinicaDoctorOut)
def crear_doctor_clinica(
    payload: ClinicaDoctorIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.doctores_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        nombre = _normalizar_texto(payload.nombre_completo)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre del doctor es obligatorio.")
        doctor = Doctor(
            nombre_completo=nombre,
            especialidad=_normalizar_texto(payload.especialidad),
            registro_profesional=_normalizar_texto(payload.registro_profesional),
            telefono=_normalizar_texto(payload.telefono),
            email=_normalizar_texto(payload.email),
            activo=bool(payload.activo),
        )
        session.add(doctor)
        session.flush()
        doctor_id = doctor.id
        session.commit()
        doctor = session.query(Doctor).options(
            noload(Doctor.consultas_oftalmologicas),
            noload(Doctor.consultas_contactologia),
        ).filter(Doctor.id == doctor_id).first()
        return _serializar_doctores(session, [doctor])[0]
    finally:
        session.close()


@router.put("/doctores/{doctor_id:int}", response_model=ClinicaDoctorOut)
def editar_doctor_clinica(
    doctor_id: int,
    payload: ClinicaDoctorIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.doctores_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        doctor = session.query(Doctor).options(
            noload(Doctor.consultas_oftalmologicas),
            noload(Doctor.consultas_contactologia),
        ).filter(Doctor.id == doctor_id).first()
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor no encontrado.")
        nombre = _normalizar_texto(payload.nombre_completo)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre del doctor es obligatorio.")
        doctor.nombre_completo = nombre
        doctor.especialidad = _normalizar_texto(payload.especialidad)
        doctor.registro_profesional = _normalizar_texto(payload.registro_profesional)
        doctor.telefono = _normalizar_texto(payload.telefono)
        doctor.email = _normalizar_texto(payload.email)
        doctor.activo = bool(payload.activo)
        session.commit()
        doctor = session.query(Doctor).options(
            noload(Doctor.consultas_oftalmologicas),
            noload(Doctor.consultas_contactologia),
        ).filter(Doctor.id == doctor.id).first()
        return _serializar_doctores(session, [doctor])[0]
    finally:
        session.close()


@router.delete("/doctores/{doctor_id:int}")
def eliminar_doctor_clinica(
    doctor_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.doctores_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        doctor = session.query(Doctor).options(
            noload(Doctor.consultas_oftalmologicas),
            noload(Doctor.consultas_contactologia),
        ).filter(Doctor.id == doctor_id).first()
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor no encontrado.")

        total_oft = _count_rows(
            session.query(func.count(ConsultaOftalmologica.id)).filter(ConsultaOftalmologica.doctor_id == doctor_id)
        )
        total_cont = _count_rows(
            session.query(func.count(ConsultaContactologia.id)).filter(ConsultaContactologia.doctor_id == doctor_id)
        )
        if (total_oft + total_cont) > 0:
            raise HTTPException(status_code=400, detail="No se puede eliminar el doctor porque ya tiene consultas asociadas.")

        session.delete(doctor)
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@router.get("/lugares/simple", response_model=list[ClinicaLugarSimpleOut])
def listar_lugares_clinica_simple(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.lugares", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        rows = session.query(LugarAtencion.id, LugarAtencion.nombre).filter(LugarAtencion.activo == 1).order_by(LugarAtencion.nombre.asc()).all()
        return [ClinicaLugarSimpleOut(id=row.id, nombre=row.nombre) for row in rows]
    finally:
        session.close()


@router.get("/lugares", response_model=ClinicaLugaresListOut)
def listar_lugares_clinica(
    buscar: str | None = Query(default=None),
    solo_activos: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.lugares", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(LugarAtencion).options(
            noload(LugarAtencion.consultas_oftalmologicas),
            noload(LugarAtencion.consultas_contactologia),
        )
        if buscar:
            term = f"%{buscar.strip()}%"
            query = query.filter(
                or_(
                    LugarAtencion.nombre.ilike(term),
                    LugarAtencion.direccion.ilike(term),
                    LugarAtencion.telefono.ilike(term),
                    LugarAtencion.contacto_responsable.ilike(term),
                    LugarAtencion.email.ilike(term),
                )
            )
        if solo_activos:
            query = query.filter(LugarAtencion.activo == 1)

        total = query.count()
        items = (
            query.order_by(LugarAtencion.fecha_creacion.desc(), LugarAtencion.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        total_pages = max(1, ceil(total / page_size)) if total else 1
        return ClinicaLugaresListOut(
            items=_serializar_lugares(session, items),
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    finally:
        session.close()


@router.post("/lugares", response_model=ClinicaLugarOut)
def crear_lugar_clinica(
    payload: ClinicaLugarIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.lugares", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        nombre = _normalizar_texto(payload.nombre)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre del lugar es obligatorio.")
        lugar = LugarAtencion(
            nombre=nombre,
            direccion=_normalizar_texto(payload.direccion),
            telefono=_normalizar_texto(payload.telefono),
            contacto_responsable=_normalizar_texto(payload.contacto_responsable),
            email=_normalizar_texto(payload.email),
            notas=_normalizar_texto(payload.notas),
            activo=1 if payload.activo else 0,
        )
        session.add(lugar)
        session.flush()
        lugar_id = lugar.id
        session.commit()
        lugar = session.query(LugarAtencion).options(
            noload(LugarAtencion.consultas_oftalmologicas),
            noload(LugarAtencion.consultas_contactologia),
        ).filter(LugarAtencion.id == lugar_id).first()
        return _serializar_lugares(session, [lugar])[0]
    finally:
        session.close()


@router.put("/lugares/{lugar_id:int}", response_model=ClinicaLugarOut)
def editar_lugar_clinica(
    lugar_id: int,
    payload: ClinicaLugarIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.lugares", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        lugar = session.query(LugarAtencion).options(
            noload(LugarAtencion.consultas_oftalmologicas),
            noload(LugarAtencion.consultas_contactologia),
        ).filter(LugarAtencion.id == lugar_id).first()
        if not lugar:
            raise HTTPException(status_code=404, detail="Lugar no encontrado.")

        nombre = _normalizar_texto(payload.nombre)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre del lugar es obligatorio.")

        lugar.nombre = nombre
        lugar.direccion = _normalizar_texto(payload.direccion)
        lugar.telefono = _normalizar_texto(payload.telefono)
        lugar.contacto_responsable = _normalizar_texto(payload.contacto_responsable)
        lugar.email = _normalizar_texto(payload.email)
        lugar.notas = _normalizar_texto(payload.notas)
        lugar.activo = 1 if payload.activo else 0
        session.commit()
        lugar = session.query(LugarAtencion).options(
            noload(LugarAtencion.consultas_oftalmologicas),
            noload(LugarAtencion.consultas_contactologia),
        ).filter(LugarAtencion.id == lugar_id).first()
        return _serializar_lugares(session, [lugar])[0]
    finally:
        session.close()


@router.delete("/lugares/{lugar_id:int}")
def eliminar_lugar_clinica(
    lugar_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.lugares", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        lugar = session.query(LugarAtencion).options(
            noload(LugarAtencion.consultas_oftalmologicas),
            noload(LugarAtencion.consultas_contactologia),
        ).filter(LugarAtencion.id == lugar_id).first()
        if not lugar:
            raise HTTPException(status_code=404, detail="Lugar no encontrado.")

        total_oft = _count_rows(session.query(func.count(ConsultaOftalmologica.id)).filter(ConsultaOftalmologica.lugar_atencion_id == lugar_id))
        total_cont = _count_rows(session.query(func.count(ConsultaContactologia.id)).filter(ConsultaContactologia.lugar_atencion_id == lugar_id))
        if (total_oft + total_cont) > 0:
            raise HTTPException(status_code=400, detail="No se puede eliminar el lugar porque ya tiene consultas asociadas.")

        session.delete(lugar)
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@router.get("/vademecum/medicamentos/simple", response_model=list[ClinicaMedicamentoSimpleOut])
def listar_medicamentos_simple(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_ver", "clinica")),
    buscar: str | None = Query(default=None),
    page_size: int = Query(default=12, ge=1, le=30),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(VademecumMedicamento.id, VademecumMedicamento.nombre_comercial)
        if buscar:
            termino = f"%{buscar.strip()}%"
            query = query.filter(VademecumMedicamento.nombre_comercial.ilike(termino))
        rows = query.order_by(VademecumMedicamento.nombre_comercial.asc()).limit(page_size).all()
        return [ClinicaMedicamentoSimpleOut(id=row.id, nombre_comercial=row.nombre_comercial) for row in rows]
    finally:
        session.close()


@router.get("/vademecum/patologias/simple", response_model=list[ClinicaPatologiaSimpleOut])
def listar_patologias_simple(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_ver", "clinica")),
    buscar: str | None = Query(default=None),
    page_size: int = Query(default=12, ge=1, le=30),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(
            VademecumPatologia.id,
            VademecumPatologia.nombre,
            VademecumPatologia.descripcion,
            VademecumPatologia.sintomas,
            VademecumPatologia.tratamiento_no_farmacologico,
        )
        if buscar:
            termino = f"%{buscar.strip()}%"
            query = query.filter(
                or_(
                    VademecumPatologia.nombre.ilike(termino),
                    VademecumPatologia.descripcion.ilike(termino),
                    VademecumPatologia.sintomas.ilike(termino),
                )
            )
        rows = query.order_by(VademecumPatologia.nombre.asc()).limit(page_size).all()
        return [
            ClinicaPatologiaSimpleOut(
                id=row.id,
                nombre=row.nombre,
                descripcion=row.descripcion,
                sintomas=row.sintomas,
                tratamiento_no_farmacologico=row.tratamiento_no_farmacologico,
            )
            for row in rows
        ]
    finally:
        session.close()


@router.get("/vademecum/medicamentos", response_model=ClinicaVademecumMedicamentosListOut)
def listar_vademecum_medicamentos(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_ver", "clinica")),
    buscar: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(VademecumMedicamento)
        if buscar:
            termino = f"%{buscar.strip()}%"
            query = query.filter(
                or_(
                    VademecumMedicamento.nombre_comercial.ilike(termino),
                    VademecumMedicamento.droga.ilike(termino),
                    VademecumMedicamento.presentacion.ilike(termino),
                    VademecumMedicamento.laboratorio.ilike(termino),
                )
            )
        total = query.count()
        total_pages = max(1, ceil(total / page_size)) if total else 1
        items = (
            query.order_by(VademecumMedicamento.nombre_comercial.asc(), VademecumMedicamento.id.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return ClinicaVademecumMedicamentosListOut(
            items=[_serializar_vademecum_medicamento(session, item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    finally:
        session.close()


@router.post("/vademecum/medicamentos", response_model=ClinicaVademecumMedicamentoOut)
def crear_vademecum_medicamento(
    payload: ClinicaVademecumMedicamentoIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        nombre = _normalizar_texto(payload.nombre_comercial)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre comercial es obligatorio.")
        existe = (
            session.query(VademecumMedicamento.id)
            .filter(func.lower(VademecumMedicamento.nombre_comercial) == nombre.lower())
            .first()
        )
        if existe:
            raise HTTPException(status_code=400, detail="Ya existe un medicamento con ese nombre comercial.")
        medicamento = VademecumMedicamento(
            nombre_comercial=nombre,
            droga=_normalizar_texto(payload.droga),
            presentacion=_normalizar_texto(payload.presentacion),
            laboratorio=_normalizar_texto(payload.laboratorio),
            indicaciones=_normalizar_texto(payload.indicaciones),
            contraindicaciones=_normalizar_texto(payload.contraindicaciones),
            posologia_habitual=_normalizar_texto(payload.posologia_habitual),
            notas=_normalizar_texto(payload.notas),
        )
        session.add(medicamento)
        session.commit()
        return _serializar_vademecum_medicamento(session, medicamento)
    finally:
        session.close()


@router.put("/vademecum/medicamentos/{medicamento_id:int}", response_model=ClinicaVademecumMedicamentoOut)
def editar_vademecum_medicamento(
    medicamento_id: int,
    payload: ClinicaVademecumMedicamentoIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        medicamento = session.query(VademecumMedicamento).filter(VademecumMedicamento.id == medicamento_id).first()
        if not medicamento:
            raise HTTPException(status_code=404, detail="Medicamento no encontrado.")
        nombre = _normalizar_texto(payload.nombre_comercial)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre comercial es obligatorio.")
        existe = (
            session.query(VademecumMedicamento.id)
            .filter(
                func.lower(VademecumMedicamento.nombre_comercial) == nombre.lower(),
                VademecumMedicamento.id != medicamento_id,
            )
            .first()
        )
        if existe:
            raise HTTPException(status_code=400, detail="Ya existe otro medicamento con ese nombre comercial.")
        medicamento.nombre_comercial = nombre
        medicamento.droga = _normalizar_texto(payload.droga)
        medicamento.presentacion = _normalizar_texto(payload.presentacion)
        medicamento.laboratorio = _normalizar_texto(payload.laboratorio)
        medicamento.indicaciones = _normalizar_texto(payload.indicaciones)
        medicamento.contraindicaciones = _normalizar_texto(payload.contraindicaciones)
        medicamento.posologia_habitual = _normalizar_texto(payload.posologia_habitual)
        medicamento.notas = _normalizar_texto(payload.notas)
        session.commit()
        return _serializar_vademecum_medicamento(session, medicamento)
    finally:
        session.close()


@router.delete("/vademecum/medicamentos/{medicamento_id:int}")
def eliminar_vademecum_medicamento(
    medicamento_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        medicamento = session.query(VademecumMedicamento).filter(VademecumMedicamento.id == medicamento_id).first()
        if not medicamento:
            raise HTTPException(status_code=404, detail="Medicamento no encontrado.")
        recetas_count = _count_rows(
            session.query(func.count(RecetaMedicamentoDetalle.id)).filter(RecetaMedicamentoDetalle.medicamento_id == medicamento_id)
        )
        if recetas_count:
            raise HTTPException(status_code=400, detail="No se puede eliminar: el medicamento ya fue usado en recetas.")
        session.delete(medicamento)
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@router.get("/vademecum/patologias", response_model=ClinicaVademecumPatologiasListOut)
def listar_vademecum_patologias(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_ver", "clinica")),
    buscar: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        query = session.query(VademecumPatologia).options(selectinload(VademecumPatologia.tratamientos).selectinload(VademecumTratamiento.medicamento_rel))
        if buscar:
            termino = f"%{buscar.strip()}%"
            query = query.filter(
                or_(
                    VademecumPatologia.nombre.ilike(termino),
                    VademecumPatologia.descripcion.ilike(termino),
                    VademecumPatologia.sintomas.ilike(termino),
                    VademecumPatologia.tratamiento_no_farmacologico.ilike(termino),
                )
            )
        total = query.count()
        total_pages = max(1, ceil(total / page_size)) if total else 1
        items = (
            query.order_by(VademecumPatologia.nombre.asc(), VademecumPatologia.id.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return ClinicaVademecumPatologiasListOut(
            items=[_serializar_vademecum_patologia(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    finally:
        session.close()


@router.get("/vademecum/patologias/{patologia_id:int}", response_model=ClinicaVademecumPatologiaOut)
def obtener_vademecum_patologia(
    patologia_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_ver", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        patologia = (
            session.query(VademecumPatologia)
            .options(
                selectinload(VademecumPatologia.tratamientos).selectinload(VademecumTratamiento.medicamento_rel)
            )
            .filter(VademecumPatologia.id == patologia_id)
            .first()
        )
        if not patologia:
            raise HTTPException(status_code=404, detail="Patologia no encontrada.")
        return _serializar_vademecum_patologia(patologia)
    finally:
        session.close()


@router.post("/vademecum/patologias", response_model=ClinicaVademecumPatologiaOut)
def crear_vademecum_patologia(
    payload: ClinicaVademecumPatologiaIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        nombre = _normalizar_texto(payload.nombre)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre de la patologia es obligatorio.")
        existe = (
            session.query(VademecumPatologia.id)
            .filter(func.lower(VademecumPatologia.nombre) == nombre.lower())
            .first()
        )
        if existe:
            raise HTTPException(status_code=400, detail="Ya existe una patologia con ese nombre.")
        patologia = VademecumPatologia(
            nombre=nombre,
            descripcion=_normalizar_texto(payload.descripcion),
            sintomas=_normalizar_texto(payload.sintomas),
            tratamiento_no_farmacologico=_normalizar_texto(payload.tratamiento_no_farmacologico),
        )
        patologia.tratamientos = [
            VademecumTratamiento(
                medicamento_id=detalle.medicamento_id,
                posologia_recomendada=_normalizar_texto(detalle.posologia_recomendada),
            )
            for detalle in (payload.tratamientos or [])
        ]
        session.add(patologia)
        session.commit()
        session.refresh(patologia)
        return _serializar_vademecum_patologia(patologia)
    finally:
        session.close()


@router.put("/vademecum/patologias/{patologia_id:int}", response_model=ClinicaVademecumPatologiaOut)
def editar_vademecum_patologia(
    patologia_id: int,
    payload: ClinicaVademecumPatologiaIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        patologia = (
            session.query(VademecumPatologia)
            .options(selectinload(VademecumPatologia.tratamientos))
            .filter(VademecumPatologia.id == patologia_id)
            .first()
        )
        if not patologia:
            raise HTTPException(status_code=404, detail="Patologia no encontrada.")
        nombre = _normalizar_texto(payload.nombre)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre de la patologia es obligatorio.")
        existe = (
            session.query(VademecumPatologia.id)
            .filter(
                func.lower(VademecumPatologia.nombre) == nombre.lower(),
                VademecumPatologia.id != patologia_id,
            )
            .first()
        )
        if existe:
            raise HTTPException(status_code=400, detail="Ya existe otra patologia con ese nombre.")
        patologia.nombre = nombre
        patologia.descripcion = _normalizar_texto(payload.descripcion)
        patologia.sintomas = _normalizar_texto(payload.sintomas)
        patologia.tratamiento_no_farmacologico = _normalizar_texto(payload.tratamiento_no_farmacologico)
        patologia.tratamientos.clear()
        patologia.tratamientos.extend([
            VademecumTratamiento(
                medicamento_id=detalle.medicamento_id,
                posologia_recomendada=_normalizar_texto(detalle.posologia_recomendada),
            )
            for detalle in (payload.tratamientos or [])
        ])
        session.commit()
        session.refresh(patologia)
        return _serializar_vademecum_patologia(patologia)
    finally:
        session.close()


@router.delete("/vademecum/patologias/{patologia_id:int}")
def eliminar_vademecum_patologia(
    patologia_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        patologia = session.query(VademecumPatologia).filter(VademecumPatologia.id == patologia_id).first()
        if not patologia:
            raise HTTPException(status_code=404, detail="Patologia no encontrada.")
        session.delete(patologia)
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@router.get("/pacientes/{paciente_id:int}/historial", response_model=ClinicaPacienteHistorialOut)
def obtener_historial_paciente_clinica(
    paciente_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.historial", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        paciente = _obtener_paciente_seguro(session, paciente_id)

        oft_rows = (
            session.query(
                ConsultaOftalmologica.id,
                ConsultaOftalmologica.fecha,
                ConsultaOftalmologica.motivo,
                ConsultaOftalmologica.diagnostico,
                ConsultaOftalmologica.plan_tratamiento,
                ConsultaOftalmologica.tipo_lente,
                ConsultaOftalmologica.material_lente,
                Doctor.nombre_completo.label("doctor_nombre"),
                LugarAtencion.nombre.label("lugar_nombre"),
            )
            .outerjoin(Doctor, Doctor.id == ConsultaOftalmologica.doctor_id)
            .outerjoin(LugarAtencion, LugarAtencion.id == ConsultaOftalmologica.lugar_atencion_id)
            .filter(ConsultaOftalmologica.paciente_id == paciente_id)
            .order_by(ConsultaOftalmologica.fecha.desc(), ConsultaOftalmologica.id.desc())
            .all()
        )
        cont_rows = (
            session.query(
                ConsultaContactologia.id,
                ConsultaContactologia.fecha,
                ConsultaContactologia.diagnostico,
                ConsultaContactologia.resumen_resultados,
                ConsultaContactologia.plan_tratamiento,
                ConsultaContactologia.tipo_lente,
                ConsultaContactologia.marca_recomendada,
                ConsultaContactologia.fecha_control,
                Doctor.nombre_completo.label("doctor_nombre"),
                LugarAtencion.nombre.label("lugar_nombre"),
            )
            .outerjoin(Doctor, Doctor.id == ConsultaContactologia.doctor_id)
            .outerjoin(LugarAtencion, LugarAtencion.id == ConsultaContactologia.lugar_atencion_id)
            .filter(ConsultaContactologia.paciente_id == paciente_id)
            .order_by(ConsultaContactologia.fecha.desc(), ConsultaContactologia.id.desc())
            .all()
        )
        recetas_rows = (
            session.query(RecetaMedicamento)
            .filter(RecetaMedicamento.paciente_id == paciente_id)
            .order_by(RecetaMedicamento.fecha_emision.desc(), RecetaMedicamento.id.desc())
            .all()
        )

        oftalmologia = [
            ClinicaConsultaHistorialOut(
                id=row.id,
                fecha=row.fecha,
                tipo="OFTALMOLOGIA",
                doctor_nombre=row.doctor_nombre,
                lugar_nombre=row.lugar_nombre,
                motivo=row.motivo,
                diagnostico=row.diagnostico,
                plan_tratamiento=row.plan_tratamiento,
                tipo_lente=row.tipo_lente,
                material_lente=row.material_lente,
            )
            for row in oft_rows
        ]
        contactologia = [
            ClinicaConsultaHistorialOut(
                id=row.id,
                fecha=row.fecha,
                tipo="CONTACTOLOGIA",
                doctor_nombre=row.doctor_nombre,
                lugar_nombre=row.lugar_nombre,
                diagnostico=row.diagnostico,
                resumen=row.resumen_resultados,
                plan_tratamiento=row.plan_tratamiento,
                tipo_lente=row.tipo_lente,
                marca_recomendada=row.marca_recomendada,
                fecha_control=row.fecha_control,
            )
            for row in cont_rows
        ]
        recetas = [
                ClinicaRecetaMedicamentoHistorialOut(
                    id=receta.id,
                    fecha_emision=receta.fecha_emision,
                    doctor_nombre=receta.doctor_nombre,
                    diagnostico=receta.diagnostico,
                    observaciones=receta.observaciones,
                    consulta_id=receta.consulta_id,
                    consulta_tipo=receta.consulta_tipo,
                    detalles=[
                    ClinicaRecetaMedicamentoDetalleHistorialOut(
                        medicamento_id=detalle.medicamento_id,
                        medicamento=(detalle.medicamento_rel.nombre_comercial if detalle.medicamento_rel else "MEDICAMENTO"),
                        posologia_personalizada=detalle.posologia_personalizada,
                        duracion_tratamiento=detalle.duracion_tratamiento,
                    )
                    for detalle in (receta.detalles_medicamentos or [])
                ],
            )
            for receta in recetas_rows
        ]

        return ClinicaPacienteHistorialOut(
            paciente=_serializar_pacientes(session, [paciente])[0],
            oftalmologia=oftalmologia,
            contactologia=contactologia,
            recetas_medicamentos=recetas,
        )
    finally:
        session.close()


@router.get("/historial-general", response_model=ClinicaHistorialGeneralOut)
def obtener_historial_clinico_general(
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    paciente_id: int | None = Query(default=None),
    doctor_id: int | None = Query(default=None),
    tipo: str | None = Query(default=None),
    buscar: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.historial", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        hoy = date.today()
        desde_dt = _inicio_dia(fecha_desde or hoy.replace(day=1))
        hasta_dt = _inicio_dia(fecha_hasta or hoy) + timedelta(days=1)
        tipo_normalizado = (tipo or "TODOS").strip().upper()
        termino = (buscar or "").strip()
        doctor_nombre_filtrado = None

        if doctor_id:
            doctor_filtrado = session.query(Doctor.id, Doctor.nombre_completo).filter(Doctor.id == doctor_id).first()
            if not doctor_filtrado:
                raise HTTPException(status_code=404, detail="Doctor no encontrado.")
            doctor_nombre_filtrado = doctor_filtrado.nombre_completo

        items: list[ClinicaHistorialGeneralItemOut] = []

        if tipo_normalizado in ("TODOS", "OFTALMOLOGIA"):
            oft_query = (
                session.query(
                    ConsultaOftalmologica.id,
                    ConsultaOftalmologica.fecha,
                    ConsultaOftalmologica.paciente_id,
                    ConsultaOftalmologica.doctor_id,
                    ConsultaOftalmologica.lugar_atencion_id,
                    ConsultaOftalmologica.motivo,
                    ConsultaOftalmologica.diagnostico,
                    ConsultaOftalmologica.plan_tratamiento,
                    Paciente.nombre_completo.label("paciente_nombre"),
                    Paciente.ci_pasaporte.label("paciente_ci"),
                    Doctor.nombre_completo.label("doctor_nombre"),
                    LugarAtencion.nombre.label("lugar_nombre"),
                )
                .join(Paciente, Paciente.id == ConsultaOftalmologica.paciente_id)
                .outerjoin(Doctor, Doctor.id == ConsultaOftalmologica.doctor_id)
                .outerjoin(LugarAtencion, LugarAtencion.id == ConsultaOftalmologica.lugar_atencion_id)
                .filter(ConsultaOftalmologica.fecha >= desde_dt, ConsultaOftalmologica.fecha < hasta_dt)
            )
            if paciente_id:
                oft_query = oft_query.filter(ConsultaOftalmologica.paciente_id == paciente_id)
            if doctor_id:
                oft_query = oft_query.filter(ConsultaOftalmologica.doctor_id == doctor_id)
            if termino:
                like_term = f"%{termino}%"
                oft_query = oft_query.filter(
                    or_(
                        Paciente.nombre_completo.ilike(like_term),
                        Paciente.ci_pasaporte.ilike(like_term),
                        Doctor.nombre_completo.ilike(like_term),
                        LugarAtencion.nombre.ilike(like_term),
                        ConsultaOftalmologica.motivo.ilike(like_term),
                        ConsultaOftalmologica.diagnostico.ilike(like_term),
                        ConsultaOftalmologica.plan_tratamiento.ilike(like_term),
                    )
                )
            items.extend(
                [
                    ClinicaHistorialGeneralItemOut(
                        id=row.id,
                        tipo="OFTALMOLOGIA",
                        fecha=row.fecha,
                        paciente_id=row.paciente_id,
                        paciente_nombre=row.paciente_nombre,
                        paciente_ci=row.paciente_ci,
                        doctor_id=row.doctor_id,
                        doctor_nombre=row.doctor_nombre,
                        lugar_atencion_id=row.lugar_atencion_id,
                        lugar_nombre=row.lugar_nombre,
                        motivo=row.motivo,
                        diagnostico=row.diagnostico,
                        resumen=row.plan_tratamiento,
                    )
                    for row in oft_query.all()
                ]
            )

        if tipo_normalizado in ("TODOS", "CONTACTOLOGIA"):
            cont_query = (
                session.query(
                    ConsultaContactologia.id,
                    ConsultaContactologia.fecha,
                    ConsultaContactologia.paciente_id,
                    ConsultaContactologia.doctor_id,
                    ConsultaContactologia.lugar_atencion_id,
                    ConsultaContactologia.diagnostico,
                    ConsultaContactologia.resumen_resultados,
                    ConsultaContactologia.plan_tratamiento,
                    Paciente.nombre_completo.label("paciente_nombre"),
                    Paciente.ci_pasaporte.label("paciente_ci"),
                    Doctor.nombre_completo.label("doctor_nombre"),
                    LugarAtencion.nombre.label("lugar_nombre"),
                )
                .join(Paciente, Paciente.id == ConsultaContactologia.paciente_id)
                .outerjoin(Doctor, Doctor.id == ConsultaContactologia.doctor_id)
                .outerjoin(LugarAtencion, LugarAtencion.id == ConsultaContactologia.lugar_atencion_id)
                .filter(ConsultaContactologia.fecha >= desde_dt, ConsultaContactologia.fecha < hasta_dt)
            )
            if paciente_id:
                cont_query = cont_query.filter(ConsultaContactologia.paciente_id == paciente_id)
            if doctor_id:
                cont_query = cont_query.filter(ConsultaContactologia.doctor_id == doctor_id)
            if termino:
                like_term = f"%{termino}%"
                cont_query = cont_query.filter(
                    or_(
                        Paciente.nombre_completo.ilike(like_term),
                        Paciente.ci_pasaporte.ilike(like_term),
                        Doctor.nombre_completo.ilike(like_term),
                        LugarAtencion.nombre.ilike(like_term),
                        ConsultaContactologia.diagnostico.ilike(like_term),
                        ConsultaContactologia.resumen_resultados.ilike(like_term),
                        ConsultaContactologia.plan_tratamiento.ilike(like_term),
                    )
                )
            items.extend(
                [
                    ClinicaHistorialGeneralItemOut(
                        id=row.id,
                        tipo="CONTACTOLOGIA",
                        fecha=row.fecha,
                        paciente_id=row.paciente_id,
                        paciente_nombre=row.paciente_nombre,
                        paciente_ci=row.paciente_ci,
                        doctor_id=row.doctor_id,
                        doctor_nombre=row.doctor_nombre,
                        lugar_atencion_id=row.lugar_atencion_id,
                        lugar_nombre=row.lugar_nombre,
                        diagnostico=row.diagnostico,
                        resumen=row.resumen_resultados or row.plan_tratamiento,
                    )
                    for row in cont_query.all()
                ]
            )

        if tipo_normalizado in ("TODOS", "RECETA_MEDICAMENTOS"):
            receta_query = (
                session.query(
                    RecetaMedicamento.id,
                    RecetaMedicamento.fecha_emision,
                    RecetaMedicamento.paciente_id,
                    RecetaMedicamento.doctor_nombre,
                    RecetaMedicamento.diagnostico,
                    RecetaMedicamento.observaciones,
                    Paciente.nombre_completo.label("paciente_nombre"),
                    Paciente.ci_pasaporte.label("paciente_ci"),
                )
                .join(Paciente, Paciente.id == RecetaMedicamento.paciente_id)
                .filter(RecetaMedicamento.fecha_emision >= desde_dt, RecetaMedicamento.fecha_emision < hasta_dt)
            )
            if paciente_id:
                receta_query = receta_query.filter(RecetaMedicamento.paciente_id == paciente_id)
            if doctor_nombre_filtrado:
                receta_query = receta_query.filter(RecetaMedicamento.doctor_nombre == doctor_nombre_filtrado)
            if termino:
                like_term = f"%{termino}%"
                receta_query = receta_query.filter(
                    or_(
                        Paciente.nombre_completo.ilike(like_term),
                        Paciente.ci_pasaporte.ilike(like_term),
                        RecetaMedicamento.doctor_nombre.ilike(like_term),
                        RecetaMedicamento.diagnostico.ilike(like_term),
                        RecetaMedicamento.observaciones.ilike(like_term),
                    )
                )
            items.extend(
                [
                    ClinicaHistorialGeneralItemOut(
                        id=row.id,
                        tipo="RECETA_MEDICAMENTOS",
                        fecha=row.fecha_emision,
                        paciente_id=row.paciente_id,
                        paciente_nombre=row.paciente_nombre,
                        paciente_ci=row.paciente_ci,
                        doctor_nombre=row.doctor_nombre,
                        diagnostico=row.diagnostico,
                        observaciones=row.observaciones,
                    )
                    for row in receta_query.all()
                ]
            )

        items.sort(key=lambda item: (item.fecha or datetime.min, item.id or 0), reverse=True)
        total = len(items)
        total_oftalmologia = sum(1 for item in items if item.tipo == "OFTALMOLOGIA")
        total_contactologia = sum(1 for item in items if item.tipo == "CONTACTOLOGIA")
        total_recetas = sum(1 for item in items if item.tipo == "RECETA_MEDICAMENTOS")
        total_pages = max(1, ceil(total / page_size)) if total else 1
        start = (page - 1) * page_size
        end = start + page_size

        return ClinicaHistorialGeneralOut(
            items=items[start:end],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            total_oftalmologia=total_oftalmologia,
            total_contactologia=total_contactologia,
            total_recetas=total_recetas,
        )
    finally:
        session.close()


@router.post("/recetas-medicamentos", response_model=ClinicaRecetaMedicamentoOut)
def crear_receta_medicamento(
    payload: ClinicaRecetaMedicamentoIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_crear", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        _obtener_paciente_seguro(session, payload.paciente_id)
        if not payload.detalles:
            raise HTTPException(status_code=400, detail="Debe agregar al menos un medicamento.")
        for detalle in payload.detalles:
            medicamento = session.query(VademecumMedicamento).filter(VademecumMedicamento.id == detalle.medicamento_id).first()
            if not medicamento:
                raise HTTPException(status_code=404, detail="Medicamento no encontrado.")

        receta = RecetaMedicamento(
            paciente_id=payload.paciente_id,
            consulta_id=payload.consulta_id,
            consulta_tipo=_normalizar_texto(payload.consulta_tipo),
            fecha_emision=payload.fecha_emision or datetime.now(),
            doctor_nombre=_normalizar_texto(payload.doctor_nombre),
            diagnostico=_normalizar_texto(payload.diagnostico),
            observaciones=_normalizar_texto(payload.observaciones),
        )
        receta.detalles_medicamentos = [
            RecetaMedicamentoDetalle(
                medicamento_id=detalle.medicamento_id,
                posologia_personalizada=_normalizar_texto(detalle.posologia_personalizada),
                duracion_tratamiento=_normalizar_texto(detalle.duracion_tratamiento),
            )
            for detalle in payload.detalles
        ]
        session.add(receta)
        session.commit()
        return _obtener_receta_medicamento_segura(session, receta.id)
    finally:
        session.close()


@router.put("/recetas-medicamentos/{receta_id:int}", response_model=ClinicaRecetaMedicamentoOut)
def editar_receta_medicamento(
    receta_id: int,
    payload: ClinicaRecetaMedicamentoIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        receta = session.query(RecetaMedicamento).filter(RecetaMedicamento.id == receta_id).first()
        if not receta:
            raise HTTPException(status_code=404, detail="Receta de medicamentos no encontrada.")
        _obtener_paciente_seguro(session, payload.paciente_id)
        if not payload.detalles:
            raise HTTPException(status_code=400, detail="Debe agregar al menos un medicamento.")
        for detalle in payload.detalles:
            medicamento = session.query(VademecumMedicamento).filter(VademecumMedicamento.id == detalle.medicamento_id).first()
            if not medicamento:
                raise HTTPException(status_code=404, detail="Medicamento no encontrado.")

        receta.paciente_id = payload.paciente_id
        receta.consulta_id = payload.consulta_id
        receta.consulta_tipo = _normalizar_texto(payload.consulta_tipo)
        receta.fecha_emision = payload.fecha_emision or receta.fecha_emision or datetime.now()
        receta.doctor_nombre = _normalizar_texto(payload.doctor_nombre)
        receta.diagnostico = _normalizar_texto(payload.diagnostico)
        receta.observaciones = _normalizar_texto(payload.observaciones)
        receta.detalles_medicamentos.clear()
        receta.detalles_medicamentos.extend([
            RecetaMedicamentoDetalle(
                medicamento_id=detalle.medicamento_id,
                posologia_personalizada=_normalizar_texto(detalle.posologia_personalizada),
                duracion_tratamiento=_normalizar_texto(detalle.duracion_tratamiento),
            )
            for detalle in payload.detalles
        ])
        session.commit()
        return _obtener_receta_medicamento_segura(session, receta.id)
    finally:
        session.close()


@router.delete("/recetas-medicamentos/{receta_id:int}")
def eliminar_receta_medicamento(
    receta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        receta = session.query(RecetaMedicamento).filter(RecetaMedicamento.id == receta_id).first()
        if not receta:
            raise HTTPException(status_code=404, detail="Receta de medicamentos no encontrada.")
        session.delete(receta)
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@router.get("/recetas-medicamentos/{receta_id:int}", response_model=ClinicaRecetaMedicamentoOut)
def obtener_receta_medicamento(
    receta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_ver", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return _obtener_receta_medicamento_segura(session, receta_id)
    finally:
        session.close()


@router.get("/recetas-medicamentos/{receta_id:int}/pdf")
def pdf_receta_medicamento(
    receta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_exportar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        receta = _obtener_receta_medicamento_segura(session, receta_id)
        paciente = _obtener_paciente_seguro(session, receta.paciente_id)
        pdf = generar_pdf_receta_medicamento_clinica(
            "HESAKA Web",
            paciente.nombre_completo,
            paciente.ci_pasaporte,
            receta.model_dump(),
        )
        return StreamingResponse(
            iter([pdf]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="receta_medicamento_{receta_id}.pdf"'},
        )
    finally:
        session.close()


@router.get("/recetas-medicamentos/{receta_id:int}/compra-pdf")
def pdf_receta_medicamento_compra(
    receta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_exportar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        receta = _obtener_receta_medicamento_segura(session, receta_id)
        paciente = _obtener_paciente_seguro(session, receta.paciente_id)
        pdf = generar_pdf_receta_medicamento_compra_clinica(
            "HESAKA Web",
            paciente.nombre_completo,
            paciente.ci_pasaporte,
            receta.model_dump(),
        )
        return StreamingResponse(
            iter([pdf]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="receta_compra_{receta_id}.pdf"'},
        )
    finally:
        session.close()


@router.get("/recetas-medicamentos/{receta_id:int}/indicaciones-pdf")
def pdf_receta_medicamento_indicaciones(
    receta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_exportar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        receta = _obtener_receta_medicamento_segura(session, receta_id)
        paciente = _obtener_paciente_seguro(session, receta.paciente_id)
        pdf = generar_pdf_receta_medicamento_indicaciones_clinica(
            "HESAKA Web",
            paciente.nombre_completo,
            paciente.ci_pasaporte,
            receta.model_dump(),
        )
        return StreamingResponse(
            iter([pdf]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="indicaciones_medicamentos_{receta_id}.pdf"'},
        )
    finally:
        session.close()


@router.post("/pacientes", response_model=ClinicaPacienteOut)
def crear_paciente_clinica(
    payload: ClinicaPacienteCreateIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.pacientes_crear", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        nombre = (payload.nombre_completo or "").strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre del paciente es obligatorio.")

        ci = (payload.ci_pasaporte or "").strip() or None
        if ci:
            existente = session.query(Paciente).filter(Paciente.ci_pasaporte == ci).first()
            if existente:
                raise HTTPException(status_code=400, detail="Ya existe un paciente con ese CI/Pasaporte.")

        referidor_id = payload.referidor_id
        if referidor_id:
            referidor = session.query(Referidor).filter(Referidor.id == referidor_id).first()
            if not referidor:
                raise HTTPException(status_code=404, detail="Referidor no encontrado.")

        paciente = Paciente(
            nombre_completo=nombre,
            fecha_nacimiento=payload.fecha_nacimiento,
            edad_manual=payload.edad_manual,
            ci_pasaporte=ci,
            telefono=(payload.telefono or "").strip() or None,
            direccion=(payload.direccion or "").strip() or None,
            referidor_id=referidor_id,
            notas=(payload.notas or "").strip() or None,
        )
        session.add(paciente)
        session.flush()
        paciente_id = paciente.id
        session.commit()
        paciente = (
            session.query(Paciente)
            .options(
                noload(Paciente.consultas_oftalmologicas),
                noload(Paciente.consultas_contactologia),
                noload(Paciente.cuestionarios),
                noload(Paciente.recetas_pdf),
                selectinload(Paciente.cliente_rel),
                selectinload(Paciente.referidor_rel),
            )
            .filter(Paciente.id == paciente_id)
            .first()
        )
        return _serializar_pacientes(session, [paciente])[0]
    finally:
        session.close()


@router.get("/pacientes/{paciente_id:int}/anamnesis", response_model=ClinicaCuestionarioOut | None)
def obtener_ultima_anamnesis_paciente(
    paciente_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_ver", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        _obtener_paciente_seguro(session, paciente_id)
        cuestionario = (
            session.query(Cuestionario)
            .filter(Cuestionario.paciente_id == paciente_id)
            .order_by(Cuestionario.fecha.desc(), Cuestionario.id.desc())
            .first()
        )
        return _serializar_cuestionario(cuestionario)
    finally:
        session.close()


@router.post("/pacientes/{paciente_id:int}/anamnesis", response_model=ClinicaCuestionarioOut)
def guardar_anamnesis_paciente(
    paciente_id: int,
    payload: ClinicaCuestionarioIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_crear", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        _obtener_paciente_seguro(session, paciente_id)
        cuestionario = Cuestionario(
            paciente_id=paciente_id,
            motivo_principal=_normalizar_texto(payload.motivo_principal),
            tiempo_molestias=_normalizar_texto(payload.tiempo_molestias),
            expectativa=_normalizar_texto(payload.expectativa),
            horas_pantalla=_normalizar_texto(payload.horas_pantalla),
            conduce=_normalizar_texto(payload.conduce),
            actividad_laboral=_normalizar_texto(payload.actividad_laboral),
            hobbies=_normalizar_texto(payload.hobbies),
            cefalea=bool(payload.cefalea),
            ardor=bool(payload.ardor),
            ojo_seco=bool(payload.ojo_seco),
            lagrimeo=bool(payload.lagrimeo),
            fotofobia=bool(payload.fotofobia),
            vision_doble=bool(payload.vision_doble),
            destellos=bool(payload.destellos),
            manchas=bool(payload.manchas),
            dificultad_cerca=bool(payload.dificultad_cerca),
            diabetes=bool(payload.diabetes),
            diabetes_controlada=bool(payload.diabetes_controlada),
            hipertension=bool(payload.hipertension),
            alergias=bool(payload.alergias),
            migranas=bool(payload.migranas),
            cirugias_previas=bool(payload.cirugias_previas),
            trauma_ocular=bool(payload.trauma_ocular),
            medicamentos=_normalizar_texto(payload.medicamentos),
            antecedentes_familiares=_normalizar_texto(payload.antecedentes_familiares),
            usa_anteojos=bool(payload.usa_anteojos),
            proposito_anteojos=_normalizar_texto(payload.proposito_anteojos),
            usa_lentes_contacto=bool(payload.usa_lentes_contacto),
            tipo_lentes_contacto=_normalizar_texto(payload.tipo_lentes_contacto),
            horas_uso_lc=_normalizar_texto(payload.horas_uso_lc),
            molestias_lc=bool(payload.molestias_lc),
        )
        session.add(cuestionario)
        session.commit()
        session.refresh(cuestionario)
        return _serializar_cuestionario(cuestionario)
    finally:
        session.close()


@router.post("/consultas/oftalmologia", response_model=ClinicaConsultaDetalleOut)
def crear_consulta_oftalmologica(
    payload: ClinicaConsultaOftalmologicaIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_crear", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        _obtener_paciente_seguro(session, payload.paciente_id)
        consulta = ConsultaOftalmologica(
            paciente_id=payload.paciente_id,
            doctor_id=payload.doctor_id,
            lugar_atencion_id=payload.lugar_atencion_id,
            fecha=payload.fecha or datetime.now(),
            motivo=_normalizar_texto(payload.motivo),
            diagnostico=_normalizar_texto(payload.diagnostico),
            plan_tratamiento=_normalizar_texto(payload.plan_tratamiento),
            tipo_lente=_normalizar_texto(payload.tipo_lente),
            material_lente=_normalizar_texto(payload.material_lente),
            tratamientos=_normalizar_texto(payload.tratamientos),
            av_cc_lejos_od=_normalizar_texto(payload.av_cc_lejos_od),
            av_cc_lejos_oi=_normalizar_texto(payload.av_cc_lejos_oi),
            ref_od_esfera=_normalizar_texto(payload.ref_od_esfera),
            ref_od_cilindro=_normalizar_texto(payload.ref_od_cilindro),
            ref_od_eje=_normalizar_texto(payload.ref_od_eje),
            ref_od_adicion=_normalizar_texto(payload.ref_od_adicion),
            ref_oi_esfera=_normalizar_texto(payload.ref_oi_esfera),
            ref_oi_cilindro=_normalizar_texto(payload.ref_oi_cilindro),
            ref_oi_eje=_normalizar_texto(payload.ref_oi_eje),
            ref_oi_adicion=_normalizar_texto(payload.ref_oi_adicion),
            examen_refraccion=bool(payload.examen_refraccion),
            examen_biomicroscopia=bool(payload.examen_biomicroscopia),
            examen_oftalmoscopia=bool(payload.examen_oftalmoscopia),
            examen_tonometria=bool(payload.examen_tonometria),
            examen_campo_visual=bool(payload.examen_campo_visual),
            examen_oct=bool(payload.examen_oct),
            examen_retinografia=bool(payload.examen_retinografia),
            examen_paquimetria=bool(payload.examen_paquimetria),
            examen_topografia=bool(payload.examen_topografia),
            examen_gonioscopia=bool(payload.examen_gonioscopia),
            examen_angiofluoresceinografia=bool(payload.examen_angiofluoresceinografia),
            examen_cicloplegia=bool(payload.examen_cicloplegia),
            biomicroscopia_parpados=_normalizar_texto(payload.biomicroscopia_parpados),
            biomicroscopia_conjuntiva=_normalizar_texto(payload.biomicroscopia_conjuntiva),
            biomicroscopia_cornea=_normalizar_texto(payload.biomicroscopia_cornea),
            biomicroscopia_camara_anterior=_normalizar_texto(payload.biomicroscopia_camara_anterior),
            biomicroscopia_iris=_normalizar_texto(payload.biomicroscopia_iris),
            biomicroscopia_cristalino=_normalizar_texto(payload.biomicroscopia_cristalino),
            tonometria_od=_normalizar_texto(payload.tonometria_od),
            tonometria_oi=_normalizar_texto(payload.tonometria_oi),
            tonometria_metodo=_normalizar_texto(payload.tonometria_metodo),
            campo_visual_tipo=_normalizar_texto(payload.campo_visual_tipo),
            campo_visual_od=_normalizar_texto(payload.campo_visual_od),
            campo_visual_oi=_normalizar_texto(payload.campo_visual_oi),
            oct_tipo=_normalizar_texto(payload.oct_tipo),
            oct_hallazgos=_normalizar_texto(payload.oct_hallazgos),
            retinografia_hallazgos=_normalizar_texto(payload.retinografia_hallazgos),
            paquimetria_od=_normalizar_texto(payload.paquimetria_od),
            paquimetria_oi=_normalizar_texto(payload.paquimetria_oi),
            topografia_tipo=_normalizar_texto(payload.topografia_tipo),
            topografia_hallazgos=_normalizar_texto(payload.topografia_hallazgos),
            gonioscopia_od=_normalizar_texto(payload.gonioscopia_od),
            gonioscopia_oi=_normalizar_texto(payload.gonioscopia_oi),
            gonioscopia_hallazgos=_normalizar_texto(payload.gonioscopia_hallazgos),
            angiofluoresceinografia_hallazgos=_normalizar_texto(payload.angiofluoresceinografia_hallazgos),
            cicloplegia_medicamento=_normalizar_texto(payload.cicloplegia_medicamento),
            cicloplegia_dosis=_normalizar_texto(payload.cicloplegia_dosis),
            cicloplegia_od_esfera=_normalizar_texto(payload.cicloplegia_od_esfera),
            cicloplegia_od_cilindro=_normalizar_texto(payload.cicloplegia_od_cilindro),
            cicloplegia_od_eje=_normalizar_texto(payload.cicloplegia_od_eje),
            cicloplegia_oi_esfera=_normalizar_texto(payload.cicloplegia_oi_esfera),
            cicloplegia_oi_cilindro=_normalizar_texto(payload.cicloplegia_oi_cilindro),
            cicloplegia_oi_eje=_normalizar_texto(payload.cicloplegia_oi_eje),
            estudios_solicitados=_normalizar_texto(payload.estudios_solicitados),
            observaciones=_normalizar_texto(payload.observaciones),
        )
        session.add(consulta)
        session.commit()
        return _obtener_consulta_oft_segura(session, consulta.id)
    finally:
        session.close()


@router.put("/consultas/oftalmologia/{consulta_id:int}", response_model=ClinicaConsultaDetalleOut)
def editar_consulta_oftalmologica(
    consulta_id: int,
    payload: ClinicaConsultaOftalmologicaIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        consulta = session.query(ConsultaOftalmologica).filter(ConsultaOftalmologica.id == consulta_id).first()
        if not consulta:
            raise HTTPException(status_code=404, detail="Consulta oftalmologica no encontrada.")
        _obtener_paciente_seguro(session, payload.paciente_id)
        consulta.paciente_id = payload.paciente_id
        consulta.doctor_id = payload.doctor_id
        consulta.lugar_atencion_id = payload.lugar_atencion_id
        consulta.fecha = payload.fecha or consulta.fecha or datetime.now()
        consulta.motivo = _normalizar_texto(payload.motivo)
        consulta.diagnostico = _normalizar_texto(payload.diagnostico)
        consulta.plan_tratamiento = _normalizar_texto(payload.plan_tratamiento)
        consulta.tipo_lente = _normalizar_texto(payload.tipo_lente)
        consulta.material_lente = _normalizar_texto(payload.material_lente)
        consulta.tratamientos = _normalizar_texto(payload.tratamientos)
        consulta.av_cc_lejos_od = _normalizar_texto(payload.av_cc_lejos_od)
        consulta.av_cc_lejos_oi = _normalizar_texto(payload.av_cc_lejos_oi)
        consulta.ref_od_esfera = _normalizar_texto(payload.ref_od_esfera)
        consulta.ref_od_cilindro = _normalizar_texto(payload.ref_od_cilindro)
        consulta.ref_od_eje = _normalizar_texto(payload.ref_od_eje)
        consulta.ref_od_adicion = _normalizar_texto(payload.ref_od_adicion)
        consulta.ref_oi_esfera = _normalizar_texto(payload.ref_oi_esfera)
        consulta.ref_oi_cilindro = _normalizar_texto(payload.ref_oi_cilindro)
        consulta.ref_oi_eje = _normalizar_texto(payload.ref_oi_eje)
        consulta.ref_oi_adicion = _normalizar_texto(payload.ref_oi_adicion)
        consulta.examen_refraccion = bool(payload.examen_refraccion)
        consulta.examen_biomicroscopia = bool(payload.examen_biomicroscopia)
        consulta.examen_oftalmoscopia = bool(payload.examen_oftalmoscopia)
        consulta.examen_tonometria = bool(payload.examen_tonometria)
        consulta.examen_campo_visual = bool(payload.examen_campo_visual)
        consulta.examen_oct = bool(payload.examen_oct)
        consulta.examen_retinografia = bool(payload.examen_retinografia)
        consulta.examen_paquimetria = bool(payload.examen_paquimetria)
        consulta.examen_topografia = bool(payload.examen_topografia)
        consulta.examen_gonioscopia = bool(payload.examen_gonioscopia)
        consulta.examen_angiofluoresceinografia = bool(payload.examen_angiofluoresceinografia)
        consulta.examen_cicloplegia = bool(payload.examen_cicloplegia)
        consulta.biomicroscopia_parpados = _normalizar_texto(payload.biomicroscopia_parpados)
        consulta.biomicroscopia_conjuntiva = _normalizar_texto(payload.biomicroscopia_conjuntiva)
        consulta.biomicroscopia_cornea = _normalizar_texto(payload.biomicroscopia_cornea)
        consulta.biomicroscopia_camara_anterior = _normalizar_texto(payload.biomicroscopia_camara_anterior)
        consulta.biomicroscopia_iris = _normalizar_texto(payload.biomicroscopia_iris)
        consulta.biomicroscopia_cristalino = _normalizar_texto(payload.biomicroscopia_cristalino)
        consulta.tonometria_od = _normalizar_texto(payload.tonometria_od)
        consulta.tonometria_oi = _normalizar_texto(payload.tonometria_oi)
        consulta.tonometria_metodo = _normalizar_texto(payload.tonometria_metodo)
        consulta.campo_visual_tipo = _normalizar_texto(payload.campo_visual_tipo)
        consulta.campo_visual_od = _normalizar_texto(payload.campo_visual_od)
        consulta.campo_visual_oi = _normalizar_texto(payload.campo_visual_oi)
        consulta.oct_tipo = _normalizar_texto(payload.oct_tipo)
        consulta.oct_hallazgos = _normalizar_texto(payload.oct_hallazgos)
        consulta.retinografia_hallazgos = _normalizar_texto(payload.retinografia_hallazgos)
        consulta.paquimetria_od = _normalizar_texto(payload.paquimetria_od)
        consulta.paquimetria_oi = _normalizar_texto(payload.paquimetria_oi)
        consulta.topografia_tipo = _normalizar_texto(payload.topografia_tipo)
        consulta.topografia_hallazgos = _normalizar_texto(payload.topografia_hallazgos)
        consulta.gonioscopia_od = _normalizar_texto(payload.gonioscopia_od)
        consulta.gonioscopia_oi = _normalizar_texto(payload.gonioscopia_oi)
        consulta.gonioscopia_hallazgos = _normalizar_texto(payload.gonioscopia_hallazgos)
        consulta.angiofluoresceinografia_hallazgos = _normalizar_texto(payload.angiofluoresceinografia_hallazgos)
        consulta.cicloplegia_medicamento = _normalizar_texto(payload.cicloplegia_medicamento)
        consulta.cicloplegia_dosis = _normalizar_texto(payload.cicloplegia_dosis)
        consulta.cicloplegia_od_esfera = _normalizar_texto(payload.cicloplegia_od_esfera)
        consulta.cicloplegia_od_cilindro = _normalizar_texto(payload.cicloplegia_od_cilindro)
        consulta.cicloplegia_od_eje = _normalizar_texto(payload.cicloplegia_od_eje)
        consulta.cicloplegia_oi_esfera = _normalizar_texto(payload.cicloplegia_oi_esfera)
        consulta.cicloplegia_oi_cilindro = _normalizar_texto(payload.cicloplegia_oi_cilindro)
        consulta.cicloplegia_oi_eje = _normalizar_texto(payload.cicloplegia_oi_eje)
        consulta.estudios_solicitados = _normalizar_texto(payload.estudios_solicitados)
        consulta.observaciones = _normalizar_texto(payload.observaciones)
        session.commit()
        return _obtener_consulta_oft_segura(session, consulta.id)
    finally:
        session.close()


@router.delete("/consultas/oftalmologia/{consulta_id:int}")
def eliminar_consulta_oftalmologica(
    consulta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        consulta = session.query(ConsultaOftalmologica).filter(ConsultaOftalmologica.id == consulta_id).first()
        if not consulta:
            raise HTTPException(status_code=404, detail="Consulta oftalmologica no encontrada.")
        session.delete(consulta)
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@router.get("/consultas/oftalmologia/{consulta_id:int}", response_model=ClinicaConsultaDetalleOut)
def obtener_consulta_oftalmologica(
    consulta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_ver", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return _obtener_consulta_oft_segura(session, consulta_id)
    finally:
        session.close()


@router.get("/consultas/oftalmologia/{consulta_id:int}/pdf")
def pdf_consulta_oftalmologica(
    consulta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_exportar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        consulta = _obtener_consulta_oft_segura(session, consulta_id)
        paciente = _obtener_paciente_seguro(session, consulta.paciente_id)
        pdf = generar_pdf_consulta_clinica("HESAKA Web", paciente.nombre_completo, paciente.ci_pasaporte, consulta.model_dump())
        return StreamingResponse(iter([pdf]), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="consulta_oft_{consulta_id}.pdf"'})
    finally:
        session.close()


@router.get("/consultas/oftalmologia/{consulta_id:int}/indicaciones-pdf")
def pdf_indicaciones_oftalmologia(
    consulta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_exportar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        consulta = _obtener_consulta_oft_segura(session, consulta_id)
        paciente = _obtener_paciente_seguro(session, consulta.paciente_id)
        pdf = generar_pdf_indicaciones_clinica(paciente.nombre_completo, paciente.ci_pasaporte, consulta.model_dump())
        return StreamingResponse(iter([pdf]), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="indicaciones_oft_{consulta_id}.pdf"'})
    finally:
        session.close()


@router.post("/consultas/contactologia", response_model=ClinicaConsultaDetalleOut)
def crear_consulta_contactologia(
    payload: ClinicaConsultaContactologiaIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_crear", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        _obtener_paciente_seguro(session, payload.paciente_id)
        consulta = ConsultaContactologia(
            paciente_id=payload.paciente_id,
            doctor_id=payload.doctor_id,
            lugar_atencion_id=payload.lugar_atencion_id,
            fecha=payload.fecha or datetime.now(),
            tipo_lente=_normalizar_texto(payload.tipo_lente),
            diseno=_normalizar_texto(payload.diseno),
            diagnostico=_normalizar_texto(payload.diagnostico),
            plan_tratamiento=_normalizar_texto(payload.plan_tratamiento),
            resumen_resultados=_normalizar_texto(payload.resumen_resultados),
            marca_recomendada=_normalizar_texto(payload.marca_recomendada),
            fecha_control=payload.fecha_control,
            observaciones=_normalizar_texto(payload.observaciones),
        )
        session.add(consulta)
        session.commit()
        return _obtener_consulta_cont_segura(session, consulta.id)
    finally:
        session.close()


@router.put("/consultas/contactologia/{consulta_id:int}", response_model=ClinicaConsultaDetalleOut)
def editar_consulta_contactologia(
    consulta_id: int,
    payload: ClinicaConsultaContactologiaIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        consulta = session.query(ConsultaContactologia).filter(ConsultaContactologia.id == consulta_id).first()
        if not consulta:
            raise HTTPException(status_code=404, detail="Consulta de contactologia no encontrada.")
        _obtener_paciente_seguro(session, payload.paciente_id)
        consulta.paciente_id = payload.paciente_id
        consulta.doctor_id = payload.doctor_id
        consulta.lugar_atencion_id = payload.lugar_atencion_id
        consulta.fecha = payload.fecha or consulta.fecha or datetime.now()
        consulta.tipo_lente = _normalizar_texto(payload.tipo_lente)
        consulta.diseno = _normalizar_texto(payload.diseno)
        consulta.diagnostico = _normalizar_texto(payload.diagnostico)
        consulta.plan_tratamiento = _normalizar_texto(payload.plan_tratamiento)
        consulta.resumen_resultados = _normalizar_texto(payload.resumen_resultados)
        consulta.marca_recomendada = _normalizar_texto(payload.marca_recomendada)
        consulta.fecha_control = payload.fecha_control
        consulta.observaciones = _normalizar_texto(payload.observaciones)
        session.commit()
        return _obtener_consulta_cont_segura(session, consulta.id)
    finally:
        session.close()


@router.delete("/consultas/contactologia/{consulta_id:int}")
def eliminar_consulta_contactologia(
    consulta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        consulta = session.query(ConsultaContactologia).filter(ConsultaContactologia.id == consulta_id).first()
        if not consulta:
            raise HTTPException(status_code=404, detail="Consulta de contactologia no encontrada.")
        session.delete(consulta)
        session.commit()
        return {"ok": True}
    finally:
        session.close()


@router.get("/consultas/contactologia/{consulta_id:int}", response_model=ClinicaConsultaDetalleOut)
def obtener_consulta_contactologia(
    consulta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_ver", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        return _obtener_consulta_cont_segura(session, consulta_id)
    finally:
        session.close()


@router.get("/consultas/contactologia/{consulta_id:int}/pdf")
def pdf_consulta_contactologia(
    consulta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_exportar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        consulta = _obtener_consulta_cont_segura(session, consulta_id)
        paciente = _obtener_paciente_seguro(session, consulta.paciente_id)
        pdf = generar_pdf_consulta_clinica("HESAKA Web", paciente.nombre_completo, paciente.ci_pasaporte, consulta.model_dump())
        return StreamingResponse(iter([pdf]), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="consulta_cont_{consulta_id}.pdf"'})
    finally:
        session.close()


@router.get("/consultas/contactologia/{consulta_id:int}/indicaciones-pdf")
def pdf_indicaciones_contactologia(
    consulta_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.consultas_exportar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        consulta = _obtener_consulta_cont_segura(session, consulta_id)
        paciente = _obtener_paciente_seguro(session, consulta.paciente_id)
        pdf = generar_pdf_indicaciones_clinica(paciente.nombre_completo, paciente.ci_pasaporte, consulta.model_dump())
        return StreamingResponse(iter([pdf]), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="indicaciones_cont_{consulta_id}.pdf"'})
    finally:
        session.close()


@router.put("/pacientes/{paciente_id:int}", response_model=ClinicaPacienteOut)
def editar_paciente_clinica(
    paciente_id: int,
    payload: ClinicaPacienteUpdateIn,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.pacientes_editar", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        paciente = _obtener_paciente_seguro(session, paciente_id)

        nombre = (payload.nombre_completo or "").strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre del paciente es obligatorio.")

        ci = (payload.ci_pasaporte or "").strip() or None
        if ci:
            existente = (
                session.query(Paciente)
                .filter(Paciente.ci_pasaporte == ci, Paciente.id != paciente_id)
                .first()
            )
            if existente:
                raise HTTPException(status_code=400, detail="Ya existe otro paciente con ese CI/Pasaporte.")

        referidor_id = payload.referidor_id
        if referidor_id:
            referidor = session.query(Referidor).filter(Referidor.id == referidor_id).first()
            if not referidor:
                raise HTTPException(status_code=404, detail="Referidor no encontrado.")

        paciente.nombre_completo = nombre
        paciente.fecha_nacimiento = payload.fecha_nacimiento
        paciente.edad_manual = payload.edad_manual
        paciente.ci_pasaporte = ci
        paciente.telefono = (payload.telefono or "").strip() or None
        paciente.direccion = (payload.direccion or "").strip() or None
        paciente.referidor_id = referidor_id
        paciente.notas = (payload.notas or "").strip() or None

        session.commit()
        paciente = (
            session.query(Paciente)
            .options(
                noload(Paciente.consultas_oftalmologicas),
                noload(Paciente.consultas_contactologia),
                noload(Paciente.cuestionarios),
                noload(Paciente.recetas_pdf),
                selectinload(Paciente.cliente_rel),
                selectinload(Paciente.referidor_rel),
            )
            .filter(Paciente.id == paciente_id)
            .first()
        )
        return _serializar_pacientes(session, [paciente])[0]
    finally:
        session.close()


@router.post("/pacientes/{paciente_id:int}/convertir-cliente", response_model=ClinicaPacienteOut)
def convertir_paciente_a_cliente(
    paciente_id: int,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user=Depends(require_action("clinica.convertir_cliente", "clinica")),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        paciente = (
            session.query(Paciente)
            .options(
                noload(Paciente.consultas_oftalmologicas),
                noload(Paciente.consultas_contactologia),
                noload(Paciente.cuestionarios),
                noload(Paciente.recetas_pdf),
                selectinload(Paciente.cliente_rel),
                selectinload(Paciente.referidor_rel),
            )
            .filter(Paciente.id == paciente_id)
            .first()
        )
        if not paciente:
            raise HTTPException(status_code=404, detail="Paciente no encontrado.")
        if paciente.cliente_id:
            raise HTTPException(status_code=400, detail="Este paciente ya fue convertido a cliente.")

        ci = (paciente.ci_pasaporte or "").strip() or None
        cliente = session.query(Cliente).filter(Cliente.ci == ci).first() if ci else None

        if cliente:
            if not cliente.telefono and paciente.telefono:
                cliente.telefono = paciente.telefono
            if not cliente.direccion and paciente.direccion:
                cliente.direccion = paciente.direccion
            if not cliente.referidor_id and getattr(paciente, "referidor_id", None):
                cliente.referidor_id = paciente.referidor_id
            if paciente.notas:
                notas_existentes = (cliente.notas or "").strip()
                cliente.notas = f"{notas_existentes}\n{paciente.notas}".strip() if notas_existentes else paciente.notas
        else:
            cliente = Cliente(
                nombre=paciente.nombre_completo,
                ci=ci,
                telefono=(paciente.telefono or "").strip() or None,
                direccion=(paciente.direccion or "").strip() or None,
                notas=(paciente.notas or "").strip() or None,
                referidor_id=getattr(paciente, "referidor_id", None),
            )
            session.add(cliente)
            session.flush()

        paciente.cliente_id = cliente.id
        session.commit()
        paciente = (
            session.query(Paciente)
            .options(
                noload(Paciente.consultas_oftalmologicas),
                noload(Paciente.consultas_contactologia),
                noload(Paciente.cuestionarios),
                noload(Paciente.recetas_pdf),
                selectinload(Paciente.cliente_rel),
                selectinload(Paciente.referidor_rel),
            )
            .filter(Paciente.id == paciente_id)
            .first()
        )
        return _serializar_pacientes(session, [paciente])[0]
    finally:
        session.close()
