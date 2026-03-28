from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


EMPRESA_SUBTITULO_FALLBACK = ""


def _texto(value):
    if value in (None, "", []):
        return "-"
    return str(value)


def _fmt_num(value):
    if value in (None, "", "-"):
        return "-"
    try:
        number = float(value)
    except Exception:
        return str(value)
    if number > 0:
        return f"+{number:.2f}"
    return f"{number:.2f}"


def _fmt_adicion(value):
    return _fmt_num(value)


def _header_block(story, styles, title_text, empresa_nombre, empresa_subtitulo=None):
    empresa = ParagraphStyle("Empresa", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, alignment=1, spaceAfter=4)
    sub = ParagraphStyle("EmpresaSub", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, alignment=1, leading=11)
    title = ParagraphStyle("DocumentoTitle", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=16, alignment=0, spaceBefore=12, spaceAfter=10)

    story.append(Paragraph(_texto(empresa_nombre) if _has_value(empresa_nombre) else "Mi Empresa", empresa))
    subtitulo = (empresa_subtitulo or EMPRESA_SUBTITULO_FALLBACK or "").strip()
    if subtitulo:
        story.append(Paragraph(subtitulo, sub))
    line = Table([[""]], colWidths=[17.2 * cm], rowHeights=[0.08 * cm])
    line.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.black)]))
    story.extend([Spacer(1, 0.35 * cm), line, Spacer(1, 0.45 * cm), Paragraph(title_text, title)])


def _simple_rows_table(rows, widths):
    table = Table(rows, colWidths=widths)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def _section_title(text):
    return ParagraphStyle(
        f"Section-{text}",
        parent=getSampleStyleSheet()["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        textColor=colors.black,
        spaceBefore=8,
        spaceAfter=6,
    )


def _has_value(value):
    return value not in (None, "", [], "-")


def _first_value(*values):
    for value in values:
        if _has_value(value):
            return value
    return None


def generar_pdf_consulta_clinica(empresa_nombre: str, paciente_nombre: str, paciente_ci: str | None, consulta: dict) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2.2 * cm,
        rightMargin=2.2 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
    )
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("NormalClinica", parent=styles["BodyText"], fontName="Helvetica", fontSize=10, leading=13)
    section = _section_title("clinica")

    tipo = _texto(consulta.get("tipo")).upper()
    titulo = "RECETA OFTALMOLOGICA" if tipo == "OFTALMOLOGIA" else "RECETA DE CONTACTOLOGIA"

    story = []
    _header_block(story, styles, titulo, empresa_nombre)

    datos = [
        [f"Paciente: {_texto(paciente_nombre)}", f"Fecha: {_texto(consulta.get('fecha'))[:10]}"],
        [f"CI/Pasaporte: {_texto(paciente_ci)}", ""],
    ]
    story.extend([_simple_rows_table(datos, [10 * cm, 7.2 * cm]), Spacer(1, 0.5 * cm)])

    if tipo == "OFTALMOLOGIA":
        rows = [
            [
                "OD",
                _fmt_num(_first_value(consulta.get("ref_od_esfera"), consulta.get("od_esfera"), consulta.get("esfera_od"))),
                _fmt_num(_first_value(consulta.get("ref_od_cilindro"), consulta.get("od_cilindro"), consulta.get("cilindro_od"))),
                _texto(_first_value(consulta.get("ref_od_eje"), consulta.get("od_eje"), consulta.get("eje_od"))),
                _fmt_adicion(_first_value(consulta.get("ref_od_adicion"), consulta.get("od_adicion"), consulta.get("adicion_od"))),
                _texto(_first_value(consulta.get("av_cc_lejos_od"), consulta.get("av_od"))),
            ],
            [
                "OI",
                _fmt_num(_first_value(consulta.get("ref_oi_esfera"), consulta.get("oi_esfera"), consulta.get("esfera_oi"))),
                _fmt_num(_first_value(consulta.get("ref_oi_cilindro"), consulta.get("oi_cilindro"), consulta.get("cilindro_oi"))),
                _texto(_first_value(consulta.get("ref_oi_eje"), consulta.get("oi_eje"), consulta.get("eje_oi"))),
                _fmt_adicion(_first_value(consulta.get("ref_oi_adicion"), consulta.get("oi_adicion"), consulta.get("adicion_oi"))),
                _texto(_first_value(consulta.get("av_cc_lejos_oi"), consulta.get("av_oi"))),
            ],
        ]
        meaningful_rows = [
            row for row in rows
            if any(_has_value(cell) and cell != "-" for cell in row[1:])
        ]
        if meaningful_rows:
            story.append(Paragraph("Agudeza visual y refraccion", section))
            header = [["OJO", "ESFERA", "CILINDRO", "EJE", "ADICION", "AV (CC Lejos)"]]
            tabla = Table(
                header + meaningful_rows,
                colWidths=[1.6 * cm, 3.0 * cm, 3.1 * cm, 2.2 * cm, 3.0 * cm, 3.2 * cm]
            )
            tabla.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 11),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LINEABOVE", (0, 0), (-1, 0), 1, colors.black),
                ("LINEBELOW", (0, 0), (-1, 0), 1, colors.black),
                ("LINEBELOW", (0, -1), (-1, -1), 1, colors.black),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.extend([tabla, Spacer(1, 0.7 * cm)])

        recomendacion = []
        if _has_value(consulta.get("tipo_lente")):
            recomendacion.append([f"Tipo de Lente: {_texto(consulta.get('tipo_lente'))}"])
        if _has_value(consulta.get("material_lente")):
            recomendacion.append([f"Material: {_texto(consulta.get('material_lente'))}"])
        if _has_value(consulta.get("tratamientos")):
            recomendacion.append([f"Tratamientos: {_texto(consulta.get('tratamientos'))}"])
        if _has_value(consulta.get("fecha_control")):
            recomendacion.append([f"Proximo control: {_texto(consulta.get('fecha_control'))}"])
        if recomendacion:
            story.append(Paragraph("Recomendacion Optica:", section))
            story.extend([_simple_rows_table(recomendacion, [17.2 * cm]), Spacer(1, 0.4 * cm)])

        if _has_value(consulta.get("plan_tratamiento")):
            story.append(Paragraph("Indicaciones / Tratamiento:", section))
            story.append(Paragraph(_texto(consulta.get("plan_tratamiento")), normal))
        obs = consulta.get("observaciones")
        if _has_value(obs):
            story.extend([Spacer(1, 0.35 * cm), Paragraph("Observaciones:", section), Paragraph(_texto(obs), normal)])
    else:
        rows = []
        if _has_value(consulta.get("doctor_nombre")):
            rows.append([f"Doctor: {_texto(consulta.get('doctor_nombre'))}"])
        if _has_value(consulta.get("diagnostico")):
            rows.append([f"Diagnostico: {_texto(consulta.get('diagnostico'))}"])
        if _has_value(consulta.get("tipo_lente")):
            rows.append([f"Tipo de lente: {_texto(consulta.get('tipo_lente'))}"])
        if _has_value(consulta.get("diseno")):
            rows.append([f"Diseno: {_texto(consulta.get('diseno'))}"])
        if _has_value(consulta.get("marca_recomendada")):
            rows.append([f"Marca recomendada: {_texto(consulta.get('marca_recomendada'))}"])
        if _has_value(consulta.get("fecha_control")):
            rows.append([f"Fecha control: {_texto(consulta.get('fecha_control'))}"])
        if rows:
            story.append(Paragraph("Datos de la consulta", section))
            story.extend([_simple_rows_table(rows, [17.2 * cm]), Spacer(1, 0.35 * cm)])

        resumen = consulta.get("resumen_resultados") or consulta.get("plan_tratamiento")
        if _has_value(resumen):
            story.append(Paragraph("Resumen / Tratamiento", section))
            story.append(Paragraph(_texto(resumen), normal))
        obs = consulta.get("observaciones")
        if _has_value(obs):
            story.extend([Spacer(1, 0.35 * cm), Paragraph("Observaciones:", section), Paragraph(_texto(obs), normal)])

    doc.build(story)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf
