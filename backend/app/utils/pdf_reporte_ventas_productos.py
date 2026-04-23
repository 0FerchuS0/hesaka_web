import io
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _fmt_gs(value):
    return f"Gs. {int(value or 0):,}".replace(",", ".")


def _fmt_percent(value):
    return f"{float(value or 0.0):.2f}%"


def _fmt_periodo(fecha_desde: date | None, fecha_hasta: date | None) -> str:
    if fecha_desde and fecha_hasta:
        return f"{fecha_desde.strftime('%d/%m/%Y')} al {fecha_hasta.strftime('%d/%m/%Y')}"
    if fecha_desde:
        return f"Desde {fecha_desde.strftime('%d/%m/%Y')}"
    if fecha_hasta:
        return f"Hasta {fecha_hasta.strftime('%d/%m/%Y')}"
    return "Todo el periodo"


def _scaled_widths(total_width, ratios):
    return [total_width * ratio for ratio in ratios]


def generar_pdf_reporte_ventas_productos(resumen, config, fecha_desde: date | None, fecha_hasta: date | None):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=0.7 * cm,
        rightMargin=0.7 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
    )
    styles = getSampleStyleSheet()
    table_text_style = ParagraphStyle(
        "TableText",
        parent=styles["BodyText"],
        fontSize=7,
        leading=8,
    )
    story = []

    empresa = config.nombre if config and config.nombre else "HESAKA"
    story.append(Paragraph(f"<b>{empresa}</b>", styles["Title"]))
    story.append(Paragraph("Reporte de Ventas por Productos", styles["Heading2"]))
    story.append(Paragraph(f"Periodo: {_fmt_periodo(fecha_desde, fecha_hasta)}", styles["Normal"]))
    story.append(Spacer(1, 0.3 * cm))

    resumen_table = Table(
        [[
            "Total Productos",
            "Cantidad Vendida",
            "Total Ingresos",
            "Total Costos",
            "Utilidad Bruta",
            "Margen Bruto Prom",
        ], [
            str(resumen.total_productos or 0),
            f"{float(resumen.total_cantidad or 0.0):,.2f}".replace(",", "."),
            _fmt_gs(resumen.total_ingresos),
            _fmt_gs(resumen.total_costos),
            _fmt_gs(resumen.utilidad_bruta_total),
            _fmt_percent(resumen.margen_bruto_promedio),
        ]],
        colWidths=[doc.width / 6] * 6,
    )
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
    ]))
    story.append(resumen_table)
    story.append(Spacer(1, 0.35 * cm))

    detalle_rows = [[
        "#",
        "Producto",
        "Categoria",
        "Cantidad",
        "Ingresos",
        "Costos",
        "Utilidad",
        "Margen",
        "Precio Prom.",
    ]]

    for idx, item in enumerate(resumen.productos or [], start=1):
        detalle_rows.append([
            str(idx),
            Paragraph(item.producto_nombre or "-", table_text_style),
            Paragraph(item.categoria_nombre or "-", table_text_style),
            f"{float(item.cantidad_vendida or 0.0):,.2f}".replace(",", "."),
            _fmt_gs(item.ingresos_totales),
            _fmt_gs(item.costos_totales),
            _fmt_gs(item.utilidad_bruta),
            _fmt_percent(item.margen_bruto),
            _fmt_gs(item.precio_promedio),
        ])

    if len(detalle_rows) == 1:
        detalle_rows.append(["-", "Sin datos", "-", "-", "-", "-", "-", "-", "-"])

    detalle_table = Table(
        detalle_rows,
        colWidths=_scaled_widths(
            doc.width,
            [0.04, 0.24, 0.13, 0.08, 0.12, 0.12, 0.12, 0.07, 0.08],
        ),
        repeatRows=1,
    )
    detalle_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
    ]))
    story.append(detalle_table)

    doc.build(story)
    buffer.seek(0)
    return buffer
