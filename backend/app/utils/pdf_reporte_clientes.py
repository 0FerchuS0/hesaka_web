import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def generar_pdf_reporte_clientes(clientes, config, buscar=None, referidor_nombre=None):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
    )
    styles = getSampleStyleSheet()
    body_style = styles["BodyText"]
    body_style.fontSize = 8
    body_style.leading = 10

    story = []
    empresa = config.nombre if config and config.nombre else "HESAKA"
    story.append(Paragraph(f"<b>{empresa}</b>", styles["Title"]))
    story.append(Paragraph("Listado de Clientes", styles["Heading2"]))
    filtros = [
        f"Referidor: {referidor_nombre}" if referidor_nombre else "Referidor: Todos",
        f"Busqueda: {buscar.strip()}" if buscar and buscar.strip() else "Busqueda: Todas",
        f"Total: {len(clientes)} cliente(s)",
    ]
    story.append(Paragraph(" | ".join(filtros), styles["Normal"]))
    story.append(Spacer(1, 0.35 * cm))

    rows = [[
        "Nombre",
        "CI / RUC",
        "Telefono",
        "Email",
        "Direccion",
        "Referidor",
        "Registro",
    ]]
    for cliente in clientes:
        rows.append([
            Paragraph(cliente.nombre or "-", body_style),
            Paragraph(cliente.ci or "-", body_style),
            Paragraph(cliente.telefono or "-", body_style),
            Paragraph(cliente.email or "-", body_style),
            Paragraph(cliente.direccion or "-", body_style),
            Paragraph(cliente.referidor_rel.nombre if cliente.referidor_rel else "-", body_style),
            Paragraph(cliente.fecha_registro.strftime("%d/%m/%Y") if cliente.fecha_registro else "-", body_style),
        ])

    table = Table(
        rows,
        colWidths=[5.2 * cm, 2.8 * cm, 3.2 * cm, 5.2 * cm, 6.2 * cm, 4.2 * cm, 2.5 * cm],
        repeatRows=1,
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(table)

    doc.build(story)
    buffer.seek(0)
    return buffer
