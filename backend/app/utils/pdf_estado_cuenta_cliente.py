import io
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _fmt_gs(value):
    return f"Gs. {int(round(value or 0)):,}".replace(",", ".")


def _fmt_fecha(value):
    return value.strftime("%d/%m/%Y") if value else "-"


def generar_pdf_estado_cuenta_cliente(detalle, config, fecha_desde: date, fecha_hasta: date):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
    )

    styles = getSampleStyleSheet()
    body_small = ParagraphStyle(
        "BodySmall",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
    )

    story = []
    empresa = config.nombre if config and config.nombre else "HESAKA"

    story.append(Paragraph(f"<b>{empresa}</b>", styles["Title"]))
    story.append(Paragraph("Estado de Cuenta del Cliente", styles["Heading2"]))
    story.append(Paragraph(f"Periodo: {fecha_desde.strftime('%d/%m/%Y')} al {fecha_hasta.strftime('%d/%m/%Y')}", styles["Normal"]))
    story.append(Spacer(1, 0.25 * cm))

    info_table = Table([
        ["Cliente", detalle.cliente_nombre or "-"],
        ["CI/RUC", detalle.cliente_ci or "-"],
        ["Telefono", detalle.cliente_telefono or "-"],
        ["Saldo pendiente", _fmt_gs(detalle.total_deuda)],
    ], colWidths=[4.2 * cm, 12.6 * cm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2ff")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 3), (1, 3), "Helvetica-Bold"),
        ("TEXTCOLOR", (1, 3), (1, 3), colors.HexColor("#b91c1c")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.35 * cm))

    story.append(Paragraph("<b>Creditos pendientes</b>", styles["Heading3"]))
    ventas_rows = [["Fecha", "Codigo", "Total", "Pagado", "Saldo", "Estado"]]
    if detalle.ventas_pendientes:
        for item in detalle.ventas_pendientes:
            ventas_rows.append([
                _fmt_fecha(item.fecha),
                item.codigo,
                _fmt_gs(item.total),
                _fmt_gs(item.pagado),
                _fmt_gs(item.saldo),
                item.estado,
            ])
    else:
        ventas_rows.append(["-", "Sin ventas pendientes en el periodo", "-", "-", "-", "-"])

    ventas_table = Table(ventas_rows, colWidths=[2.4 * cm, 3.2 * cm, 3.1 * cm, 3.1 * cm, 3.1 * cm, 2.2 * cm], repeatRows=1)
    ventas_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (2, 1), (4, -1), "RIGHT"),
        ("ALIGN", (5, 1), (5, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(ventas_table)
    story.append(Spacer(1, 0.35 * cm))

    story.append(Paragraph("<b>Movimientos del estado de cuenta</b>", styles["Heading3"]))
    movimientos_rows = [["Fecha", "Tipo", "Descripcion", "Debito", "Credito", "Saldo"]]
    if detalle.movimientos:
        for item in detalle.movimientos:
            movimientos_rows.append([
                _fmt_fecha(item.fecha),
                item.tipo,
                Paragraph(item.descripcion or "-", body_small),
                _fmt_gs(item.debito),
                _fmt_gs(item.credito),
                _fmt_gs(item.saldo_acumulado),
            ])
    else:
        movimientos_rows.append(["-", "-", "Sin movimientos en el periodo", "-", "-", "-"])

    movimientos_table = Table(
        movimientos_rows,
        colWidths=[2.3 * cm, 1.9 * cm, 7.2 * cm, 2.2 * cm, 2.2 * cm, 2.2 * cm],
        repeatRows=1,
    )
    movimientos_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.6),
        ("ALIGN", (3, 1), (5, -1), "RIGHT"),
        ("ALIGN", (1, 1), (1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(movimientos_table)

    doc.build(story)
    buffer.seek(0)
    return buffer
