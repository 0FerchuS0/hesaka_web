from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


EMPRESA_SUBTITULO_FALLBACK = ""


def _texto(value):
    if value in (None, "", []):
        return "-"
    return str(value)


def _header_block(story, styles, empresa_nombre, empresa_subtitulo=None):
    empresa = ParagraphStyle("Empresa", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, alignment=1, spaceAfter=4)
    sub = ParagraphStyle("EmpresaSub", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, alignment=1, leading=11)
    receta = ParagraphStyle("RecetaMed", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=15, alignment=1, textColor=colors.HexColor("#22c55e"), spaceBefore=12, spaceAfter=8)
    line = Table([[""]], colWidths=[17.2 * cm], rowHeights=[0.08 * cm])
    line.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.black)]))
    story.append(Paragraph(_texto(empresa_nombre) if empresa_nombre else "Mi Empresa", empresa))
    subtitulo = (empresa_subtitulo or EMPRESA_SUBTITULO_FALLBACK or "").strip()
    if subtitulo:
        story.append(Paragraph(subtitulo, sub))
    story.extend([Spacer(1, 0.35 * cm), line, Spacer(1, 0.2 * cm), Paragraph("RECETA MEDICA", receta)])


def _section_style():
    return ParagraphStyle(
        "SectionTitleMed",
        parent=getSampleStyleSheet()["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11.5,
        textColor=colors.black,
        spaceBefore=10,
        spaceAfter=6,
    )


def _render_receta_copy(story, styles, empresa_nombre, paciente_nombre, paciente_ci, receta, compra=False):
    normal = ParagraphStyle("NormalMed", parent=styles["BodyText"], fontName="Helvetica", fontSize=10, leading=13)
    italic = ParagraphStyle("ItalicMed", parent=normal, fontName="Helvetica-Oblique", fontSize=9)
    receta_title = ParagraphStyle("RxTitle", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, textColor=colors.HexColor("#22c55e"), spaceBefore=12, spaceAfter=6)
    section = _section_style()
    copy_title = ParagraphStyle(
        "CopyTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        alignment=1,
        textColor=colors.HexColor("#15803d") if not compra else colors.HexColor("#0f766e"),
        spaceBefore=2,
        spaceAfter=6,
    )

    _header_block(story, styles, empresa_nombre)
    story.append(
        Paragraph(
            "COPIA CON INDICACIONES" if not compra else "COPIA PARA COMPRA DE MEDICAMENTOS",
            copy_title,
        )
    )

    story.append(Paragraph("DATOS DEL PACIENTE", section))
    story.append(Paragraph(f"Paciente: {_texto(paciente_nombre)}", normal))
    story.append(Paragraph(f"DNI/CI: {_texto(paciente_ci)}", normal))
    story.append(Paragraph(f"Fecha de emision: {_texto(receta.get('fecha_emision'))[:10]}", normal))
    story.append(Spacer(1, 0.25 * cm))

    if receta.get("diagnostico"):
        story.append(Paragraph("DIAGNOSTICO", section))
        story.append(Paragraph(_texto(receta.get("diagnostico")), normal))
        story.append(Spacer(1, 0.35 * cm))

    story.append(Paragraph("Rp/ MEDICAMENTOS PRESCRITOS", receta_title))
    green_line = Table([[""]], colWidths=[17.2 * cm], rowHeights=[0.05 * cm])
    green_line.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#34d399"))]))
    story.extend([green_line, Spacer(1, 0.2 * cm)])

    detalles = receta.get("detalles") or []
    if detalles:
        for idx, detalle in enumerate(detalles, start=1):
            story.append(Paragraph(f"{idx}. {_texto(detalle.get('medicamento')).upper()}", ParagraphStyle("MedBold", parent=normal, fontName="Helvetica-Bold", fontSize=10.5)))
            if not compra:
                if detalle.get("posologia_personalizada"):
                    story.append(Paragraph(f"({_texto(detalle.get('posologia_personalizada'))})", italic))
                if detalle.get("duracion_tratamiento"):
                    story.append(Paragraph(f"Presentacion / Duracion: {_texto(detalle.get('duracion_tratamiento'))}", normal))
            elif detalle.get("duracion_tratamiento"):
                story.append(Paragraph(f"Presentacion: {_texto(detalle.get('duracion_tratamiento'))}", normal))
            story.append(Spacer(1, 0.18 * cm))
    else:
        story.append(Paragraph("Sin medicamentos cargados.", normal))

    if not compra and receta.get("observaciones"):
        story.extend([Spacer(1, 0.4 * cm), Paragraph("OBSERVACIONES", section), Paragraph(_texto(receta.get("observaciones")), normal)])

    if compra:
        story.extend(
            [
                Spacer(1, 0.7 * cm),
                Paragraph("Firma y sello del profesional", ParagraphStyle("Firma", parent=normal, alignment=2, fontName="Helvetica", fontSize=9)),
            ]
        )


def generar_pdf_receta_medicamento_clinica(empresa_nombre: str, paciente_nombre: str, paciente_ci: str | None, receta: dict) -> bytes:
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
    story = []
    _render_receta_copy(story, styles, empresa_nombre, paciente_nombre, paciente_ci, receta, compra=False)
    story.append(PageBreak())
    _render_receta_copy(story, styles, empresa_nombre, paciente_nombre, paciente_ci, receta, compra=True)

    doc.build(story)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf


def generar_pdf_receta_medicamento_compra_clinica(empresa_nombre: str, paciente_nombre: str, paciente_ci: str | None, receta: dict) -> bytes:
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
    story = []
    _render_receta_copy(story, styles, empresa_nombre, paciente_nombre, paciente_ci, receta, compra=True)
    doc.build(story)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf


def generar_pdf_receta_medicamento_indicaciones_clinica(empresa_nombre: str, paciente_nombre: str, paciente_ci: str | None, receta: dict) -> bytes:
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
    story = []
    _render_receta_copy(story, styles, empresa_nombre, paciente_nombre, paciente_ci, receta, compra=False)
    doc.build(story)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf
