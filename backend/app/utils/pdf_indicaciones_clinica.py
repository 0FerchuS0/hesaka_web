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


def _has_value(value):
    return value not in (None, "", [], "-")


def _header_block(story, styles, title_text, empresa_nombre, empresa_subtitulo=None):
    empresa = ParagraphStyle("EmpresaInd", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, alignment=1, spaceAfter=4)
    sub = ParagraphStyle("EmpresaSubInd", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, alignment=1, leading=11)
    title = ParagraphStyle("DocumentoTitleInd", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=16, alignment=0, spaceBefore=12, spaceAfter=10)

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


def generar_pdf_indicaciones_clinica(empresa_nombre: str, paciente_nombre: str, paciente_ci: str | None, consulta: dict) -> bytes:
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
    normal = ParagraphStyle("NormalIndicaciones", parent=styles["BodyText"], fontName="Helvetica", fontSize=10, leading=13)
    section = ParagraphStyle("SectionIndicaciones", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, textColor=colors.black, spaceBefore=8, spaceAfter=6)

    story = []
    _header_block(story, styles, "INDICACIONES", empresa_nombre)

    datos = [
        [f"Paciente: {_texto(paciente_nombre)}", f"Fecha: {_texto(consulta.get('fecha'))[:10]}"],
        [f"CI/Pasaporte: {_texto(paciente_ci)}", f"Doctor: {_texto(consulta.get('doctor_nombre'))}"],
    ]
    story.extend([_simple_rows_table(datos, [8.6 * cm, 8.6 * cm]), Spacer(1, 0.45 * cm)])

    if _has_value(consulta.get("diagnostico")):
        story.append(Paragraph("Diagnostico", section))
        story.append(Paragraph(_texto(consulta.get("diagnostico")), normal))
        story.append(Spacer(1, 0.25 * cm))

    main_text = consulta.get("plan_tratamiento") or consulta.get("resumen_resultados")
    if _has_value(main_text):
        story.append(Paragraph("Indicaciones / Tratamiento", section))
        story.append(Paragraph(_texto(main_text), normal))
        story.append(Spacer(1, 0.25 * cm))

    if _has_value(consulta.get("observaciones")):
        story.append(Paragraph("Observaciones", section))
        story.append(Paragraph(_texto(consulta.get("observaciones")), normal))

    doc.build(story)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf
