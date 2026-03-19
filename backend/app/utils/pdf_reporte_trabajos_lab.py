import io
import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _fmt_gs(value):
    return f"{int(value or 0):,}".replace(",", ".")


def generar_pdf_reporte_trabajos_lab(trabajos, config, fecha_desde=None, fecha_hasta=None):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=1 * cm,
        bottomMargin=1.5 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Heading1"],
        fontSize=18,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#1f2937"),
        spaceAfter=10,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        fontSize=10,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#6b7280"),
        spaceAfter=14,
    )
    cell_style = ParagraphStyle(
        "Cell",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=10,
        alignment=TA_LEFT,
        textColor=colors.black,
    )
    elements = []

    if config and getattr(config, "logo_path", None) and os.path.exists(config.logo_path):
        try:
            logo = Image(config.logo_path, width=1.8 * cm, height=1.8 * cm)
            logo.hAlign = "LEFT"
            elements.append(logo)
        except Exception:
            pass

    nombre_empresa = getattr(config, "nombre", None) or "CENTRO OPTICO SANTA FE"
    elements.append(Paragraph(nombre_empresa, title_style))

    if fecha_desde and fecha_hasta:
        periodo = f"Periodo: {fecha_desde.strftime('%d/%m/%Y')} al {fecha_hasta.strftime('%d/%m/%Y')}"
    else:
        periodo = "Periodo: mes actual"
    elements.append(Paragraph(periodo, subtitle_style))
    elements.append(Paragraph(f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 0.3 * cm))

    resumen_data = [
        ["Metricas", "Valor"],
        ["Trabajos en laboratorio", str(len(trabajos))],
        ["Saldo pendiente total", f"Gs. {_fmt_gs(sum(item.saldo_pendiente for item in trabajos))}"],
    ]
    resumen_table = Table(resumen_data, colWidths=[8 * cm, 8 * cm])
    resumen_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#eff6ff")),
        ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#bfdbfe")),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("ALIGN", (1, 1), (1, -1), "RIGHT"),
    ]))
    elements.append(resumen_table)
    elements.append(Spacer(1, 0.5 * cm))

    data = [[
        "Codigo",
        "Fecha",
        "Cliente",
        "Detalle / Graduacion",
        "Saldo",
    ]]
    for item in trabajos:
        data.append([
            Paragraph(item.codigo, cell_style),
            Paragraph(item.fecha.strftime("%d/%m/%Y"), cell_style),
            Paragraph(item.cliente_nombre or "N/A", cell_style),
            Paragraph(item.detalle_trabajo or "Sin detalles", cell_style),
            Paragraph(f"Gs. {_fmt_gs(item.saldo_pendiente)}", cell_style),
        ])

    detail_table = Table(data, colWidths=[2.3 * cm, 2.2 * cm, 4.1 * cm, 6.3 * cm, 2.6 * cm], repeatRows=1)
    detail_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (4, 1), (4, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(detail_table)

    doc.build(elements)
    buffer.seek(0)
    return buffer
