import io
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _fmt_gs(value):
    return f"Gs. {int(value or 0):,}".replace(",", ".")


def generar_pdf_reporte_compras(resumen, compras_data, config, fecha_desde: date, fecha_hasta: date):
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
    story = []

    empresa = config.nombre if config and config.nombre else "HESAKA"
    story.append(Paragraph(f"<b>{empresa}</b>", styles["Title"]))
    story.append(Paragraph("Reporte de Compras y Proveedores", styles["Heading2"]))
    story.append(Paragraph(f"Periodo: {fecha_desde.strftime('%d/%m/%Y')} al {fecha_hasta.strftime('%d/%m/%Y')}", styles["Normal"]))
    story.append(Spacer(1, 0.3 * cm))

    resumen_table = Table([
        ["Total Comprado", "Total Pagado", "Saldo Pendiente", "Compras Crédito", "Compras Contado", "Compras con OS"],
        [
            _fmt_gs(resumen.total_comprado),
            _fmt_gs(resumen.total_pagado),
            _fmt_gs(resumen.total_pendiente),
            _fmt_gs(resumen.total_credito),
            _fmt_gs(resumen.total_contado),
            _fmt_gs(resumen.total_os),
        ]
    ], colWidths=[4.3 * cm] * 6)
    resumen_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f8fafc")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(resumen_table)
    story.append(Spacer(1, 0.35 * cm))

    story.append(Paragraph("<b>Resumen por proveedor</b>", styles["Heading3"]))
    proveedores_rows = [["Proveedor", "Compras", "Total", "Pagado", "Pendiente"]]
    for item in resumen.por_proveedor:
        proveedores_rows.append([
            item.proveedor_nombre,
            str(item.cantidad_compras),
            _fmt_gs(item.total_comprado),
            _fmt_gs(item.total_pagado),
            _fmt_gs(item.saldo_pendiente),
        ])
    proveedores_table = Table(proveedores_rows, colWidths=[10 * cm, 2.2 * cm, 4 * cm, 4 * cm, 4 * cm])
    proveedores_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(proveedores_table)
    story.append(Spacer(1, 0.35 * cm))

    story.append(Paragraph("<b>Detalle de compras</b>", styles["Heading3"]))
    detalle_rows = [[
        "Fecha", "Proveedor", "OS", "Documento", "Condición", "Estado", "Total", "Pagado", "Saldo"
    ]]
    for compra in compras_data:
        detalle_rows.append([
            compra["fecha"].strftime("%d/%m/%Y") if compra.get("fecha") else "-",
            Paragraph(compra.get("proveedor_nombre") or "-", styles["BodyText"]),
            Paragraph(compra.get("nro_os") or "-", styles["BodyText"]),
            Paragraph(f'{compra.get("tipo_documento") or "-"} {compra.get("nro_factura") or ""}'.strip(), styles["BodyText"]),
            compra.get("condicion_pago") or "-",
            compra.get("estado") or "-",
            _fmt_gs(compra.get("total")),
            _fmt_gs(compra.get("total_pagado")),
            _fmt_gs(compra.get("saldo")),
        ])
    detalle_table = Table(
        detalle_rows,
        colWidths=[2.6 * cm, 5.2 * cm, 3.4 * cm, 4.8 * cm, 2.6 * cm, 2.4 * cm, 3 * cm, 3 * cm, 3 * cm],
        repeatRows=1
    )
    detalle_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (4, 1), (-1, -1), "CENTER"),
    ]))
    story.append(detalle_table)

    doc.build(story)
    buffer.seek(0)
    return buffer
