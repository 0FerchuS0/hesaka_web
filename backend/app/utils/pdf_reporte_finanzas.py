import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


GREEN_TEXT = colors.HexColor("#15803d")
GREEN_BG = colors.HexColor("#dcfce7")
RED_TEXT = colors.HexColor("#b91c1c")
RED_BG = colors.HexColor("#fee2e2")
BLUE_TEXT = colors.HexColor("#1d4ed8")
BLUE_BG = colors.HexColor("#dbeafe")
AMBER_TEXT = colors.HexColor("#b45309")
AMBER_BG = colors.HexColor("#fef3c7")
NEUTRAL_BG = colors.HexColor("#f8fafc")


def _build_currency_cell(value, is_negative=False):
    prefix = "- " if is_negative else ""
    color = RED_TEXT if is_negative else GREEN_TEXT
    amount = f"{int(abs(value)):,}".replace(",", ".")
    return Paragraph(
        f'<font color="{color}"><b>{prefix}Gs. {amount}</b></font>',
        ParagraphStyle(
            "AmountCell",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            alignment=TA_LEFT,
        ),
    )


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
        ["Ingreso del Dia", f"{int(getattr(resumen, 'total_cobrado_ventas_con_saldo', 0.0)):,}".replace(",", ".")],
        ["Credito del Dia", f"{int(getattr(resumen, 'cuentas_por_cobrar_dia', 0.0)):,}".replace(",", ".")],
        ["Venta Total del Dia", f"{int(getattr(resumen, 'venta_total_dia', 0.0)):,}".replace(",", ".")],
        ["Cantidad de Ventas del Dia", str(int(getattr(resumen, "cantidad_ventas_dia", 0) or 0))],
        ["Ventas con Saldo Pendiente", str(int(getattr(resumen, "cantidad_ventas_cobrar_dia", 0) or 0))],
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
        ("BACKGROUND", (0, 1), (-1, 1), GREEN_BG),
        ("TEXTCOLOR", (0, 1), (-1, 1), GREEN_TEXT),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("BACKGROUND", (0, 2), (-1, 2), RED_BG),
        ("TEXTCOLOR", (0, 2), (-1, 2), RED_TEXT),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("BACKGROUND", (0, 3), (-1, 3), BLUE_BG if resumen.resultado_neto >= 0 else AMBER_BG),
        ("TEXTCOLOR", (0, 3), (-1, 3), BLUE_TEXT if resumen.resultado_neto >= 0 else AMBER_TEXT),
        ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
        ("BACKGROUND", (0, 9), (-1, 13), NEUTRAL_BG),
        ("FONTNAME", (0, 9), (-1, 13), "Helvetica-Bold"),
        ("BACKGROUND", (0, 11), (-1, 11), BLUE_BG),
        ("TEXTCOLOR", (0, 11), (-1, 11), BLUE_TEXT),
        ("FONTNAME", (0, 11), (-1, 11), "Helvetica-Bold"),
        ("BACKGROUND", (0, 14), (-1, 14), BLUE_BG),
        ("TEXTCOLOR", (0, 14), (-1, 14), BLUE_TEXT),
        ("FONTNAME", (0, 14), (-1, 14), "Helvetica-Bold"),
    ]))
    elements.append(resumen_table)
    elements.append(Spacer(1, 0.8 * cm))

    desglose_medios = list(getattr(resumen, "desglose_medios", []) or [])
    if desglose_medios:
        elements.append(Paragraph("DESGLOSE POR MEDIO", section_style))
        desglose_data = [["Medio", "Ingresos", "Egresos", "Neto", "Movimientos"]]
        for item in desglose_medios:
            desglose_data.append([
                item.get("medio") or "-",
                f"{int(item.get('ingresos') or 0):,}".replace(",", "."),
                f"{int(item.get('egresos') or 0):,}".replace(",", "."),
                f"{int(item.get('neto') or 0):,}".replace(",", "."),
                str(item.get("cantidad_movimientos") or 0),
            ])

        desglose_table = Table(desglose_data, colWidths=[4.4 * cm, 3 * cm, 3 * cm, 3 * cm, 2.2 * cm])
        desglose_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (1, 1), (3, -1), "RIGHT"),
            ("ALIGN", (4, 1), (4, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#bdc3c7")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ]))
        elements.append(desglose_table)
        elements.append(Spacer(1, 0.6 * cm))

    elements.append(Paragraph("DETALLE DE MOVIMIENTOS", section_style))
    detail_data = [[
        "Fecha",
        "Origen",
        "Medio",
        "Banco",
        "Categoria",
        "Tipo",
        "Concepto",
        "Referencia",
        "Monto",
    ]]

    for mov in resumen.todos:
        es_egreso = "EGRESO" in (mov.tipo or "").upper() or "(-)" in (mov.tipo or "")
        detail_data.append([
            Paragraph(mov.fecha.strftime("%d/%m/%Y %H:%M"), cell_style),
            Paragraph(mov.origen, cell_style),
            Paragraph(getattr(mov, "medio", "-") or "-", cell_style),
            Paragraph(mov.banco_nombre or "-", cell_style),
            Paragraph(mov.categoria or "-", cell_style),
            Paragraph(
                f'<font color="{RED_TEXT if es_egreso else GREEN_TEXT}"><b>{mov.tipo}</b></font>',
                cell_style,
            ),
            Paragraph(mov.concepto or "-", cell_style),
            Paragraph(mov.referencia or "-", cell_style),
            _build_currency_cell(mov.monto, es_egreso),
        ])

    detail_table = Table(detail_data, colWidths=[1.9 * cm, 1.3 * cm, 1.8 * cm, 1.8 * cm, 2.2 * cm, 1.5 * cm, 3.1 * cm, 1.8 * cm, 1.6 * cm])
    detail_style = [
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
    ]

    for row_index, mov in enumerate(resumen.todos, start=1):
        es_egreso = "EGRESO" in (mov.tipo or "").upper() or "(-)" in (mov.tipo or "")
        if es_egreso:
            detail_style.append(("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor("#fff5f5")))
        else:
            detail_style.append(("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor("#f0fdf4")))

    detail_table.setStyle(TableStyle(detail_style))
    elements.append(detail_table)

    doc.build(elements)
    buffer.seek(0)
    return buffer
