import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def generar_pdf_reporte_finanzas(
    resumen,
    config,
    fecha_desde=None,
    fecha_hasta=None,
):
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
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=18,
        textColor=colors.HexColor("#2c3e50"),
        alignment=TA_CENTER,
        spaceAfter=12,
        fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "CustomSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#7f8c8d"),
        alignment=TA_CENTER,
        spaceAfter=8,
    )
    section_style = ParagraphStyle(
        "SectionTitle",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#3498db"),
        spaceAfter=10,
        fontName="Helvetica-Bold",
    )
    cell_style = ParagraphStyle(
        "CellText",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#2c3e50"),
        alignment=TA_LEFT,
    )

    company_name = config.nombre if (config and config.nombre) else "HESAKA"
    elements = [
        Paragraph(company_name, title_style),
        Paragraph("REPORTE FINANCIERO", title_style),
    ]

    if fecha_desde and fecha_hasta:
        period_text = f"Periodo: {fecha_desde.strftime('%d/%m/%Y')} al {fecha_hasta.strftime('%d/%m/%Y')}"
    else:
        period_text = "Periodo: Movimientos financieros"
    elements.append(Paragraph(period_text, subtitle_style))
    elements.append(Paragraph(f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 0.4 * cm))

    elements.append(Paragraph("RESUMEN", section_style))
    resumen_data = [
        ["Metrica", "Valor"],
        ["Total Ingresos", f"{int(resumen.total_ingresos):,}".replace(",", ".")],
        ["Total Egresos", f"{int(resumen.total_egresos):,}".replace(",", ".")],
        ["Resultado Neto", f"{int(resumen.resultado_neto):,}".replace(",", ".")],
        ["Margen", f"{resumen.margen:.2f}%"],
        ["Ingresos Caja", f"{int(resumen.ingresos_caja):,}".replace(",", ".")],
        ["Ingresos Banco", f"{int(resumen.ingresos_banco):,}".replace(",", ".")],
        ["Egresos Caja", f"{int(resumen.egresos_caja):,}".replace(",", ".")],
        ["Egresos Banco", f"{int(resumen.egresos_banco):,}".replace(",", ".")],
        ["Saldo Actual Caja", f"{int(resumen.saldo_actual_caja):,}".replace(",", ".")],
        ["Saldo Actual Bancos", f"{int(resumen.saldo_actual_bancos):,}".replace(",", ".")],
        ["Saldo Final Total", f"{int(resumen.saldo_final_total):,}".replace(",", ".")],
        ["Cantidad Movimientos", str(len(resumen.todos))],
    ]
    resumen_table = Table(resumen_data, colWidths=[8 * cm, 8 * cm])
    resumen_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3498db")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 1), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#bdc3c7")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
    ]))
    elements.append(resumen_table)
    elements.append(Spacer(1, 0.8 * cm))

    elements.append(Paragraph("DETALLE DE MOVIMIENTOS", section_style))
    detail_data = [[
        "Fecha",
        "Origen",
        "Banco",
        "Categoria",
        "Tipo",
        "Concepto",
        "Referencia",
        "Monto",
    ]]

    for mov in resumen.todos:
        detail_data.append([
            Paragraph(mov.fecha.strftime("%d/%m/%Y %H:%M"), cell_style),
            Paragraph(mov.origen, cell_style),
            Paragraph(mov.banco_nombre or "-", cell_style),
            Paragraph(mov.categoria or "-", cell_style),
            Paragraph(mov.tipo, cell_style),
            Paragraph(mov.concepto or "-", cell_style),
            Paragraph(mov.referencia or "-", cell_style),
            Paragraph(f"{int(mov.monto):,}".replace(",", "."), cell_style),
        ])

    detail_table = Table(detail_data, colWidths=[2.3 * cm, 1.7 * cm, 2.2 * cm, 2.7 * cm, 1.9 * cm, 3.6 * cm, 2.4 * cm, 1.9 * cm])
    detail_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#bdc3c7")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]),
        ("ALIGN", (7, 1), (7, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(detail_table)

    doc.build(elements)
    buffer.seek(0)
    return buffer
