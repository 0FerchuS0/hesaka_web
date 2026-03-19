import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _fmt_gs(value):
    return f"Gs. {int(round(value or 0)):,}".replace(",", ".")


def _fmt_fecha(value):
    return value.strftime("%d/%m/%Y") if value else "-"


def _paragraph(text, style):
    return Paragraph(str(text or "-").replace("\n", "<br/>"), style)


def _build_doc():
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
    small = ParagraphStyle(
        "FichaSmall",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        wordWrap="CJK",
    )
    return buffer, doc, styles, small


def _build_info_table(rows):
    table = Table(rows, colWidths=[4.2 * cm, 12.6 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2ff")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def _style_table(table):
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def generar_pdf_ficha_cliente(ficha, config):
    buffer, doc, styles, small = _build_doc()
    empresa = config.nombre if config and config.nombre else "HESAKA"

    story = [
        Paragraph(f"<b>{empresa}</b>", styles["Title"]),
        Paragraph("Ficha de Cliente", styles["Heading2"]),
        Spacer(1, 0.25 * cm),
        _build_info_table([
            ["Cliente", ficha.cliente.nombre],
            ["CI/RUC", ficha.cliente.ci or "-"],
            ["Telefono", ficha.cliente.telefono or "-"],
            ["Email", ficha.cliente.email or "-"],
            ["Direccion", ficha.cliente.direccion or "-"],
            ["Referidor", ficha.cliente.referidor_nombre or "-"],
            ["Deuda total", _fmt_gs(ficha.deuda_total)],
        ]),
        Spacer(1, 0.35 * cm),
    ]

    story.append(Paragraph("<b>Ultima graduacion</b>", styles["Heading3"]))
    if ficha.ultima_graduacion:
        grad = ficha.ultima_graduacion
        story.append(_build_info_table([
            ["Presupuesto", f"{grad.codigo_presupuesto} - {_fmt_fecha(grad.fecha_presupuesto)}"],
            ["Fecha receta", _fmt_fecha(grad.fecha_receta)],
            ["Doctor", grad.doctor or "-"],
            ["OD", f"Esf {grad.od_esfera or '-'} | Cil {grad.od_cilindro or '-'} | Eje {grad.od_eje or '-'} | Add {grad.od_adicion or '-'}"],
            ["OI", f"Esf {grad.oi_esfera or '-'} | Cil {grad.oi_cilindro or '-'} | Eje {grad.oi_eje or '-'} | Add {grad.oi_adicion or '-'}"],
            ["Observaciones", grad.observaciones or "-"],
        ]))
    else:
        story.append(Paragraph("No hay graduacion registrada.", styles["Normal"]))
    story.append(Spacer(1, 0.35 * cm))

    story.append(Paragraph("<b>Ventas pendientes</b>", styles["Heading3"]))
    rows = [["Fecha", "Venta", "Total", "Pagado", "Saldo", "Estado"]]
    if ficha.ventas_pendientes:
        for item in ficha.ventas_pendientes:
            rows.append([
                _fmt_fecha(item.fecha),
                item.codigo,
                _fmt_gs(item.total),
                _fmt_gs(item.pagado),
                _fmt_gs(item.saldo),
                item.estado,
            ])
    else:
        rows.append(["-", "Sin ventas pendientes", "-", "-", "-", "-"])
    table = Table(rows, colWidths=[2.2 * cm, 2.8 * cm, 3.0 * cm, 3.0 * cm, 3.0 * cm, 2.4 * cm], repeatRows=1)
    _style_table(table)
    table.setStyle(TableStyle([("ALIGN", (2, 1), (4, -1), "RIGHT"), ("ALIGN", (5, 1), (5, -1), "CENTER")]))
    story.extend([table, Spacer(1, 0.35 * cm)])

    story.append(Paragraph("<b>Estado de cuenta</b>", styles["Heading3"]))
    rows = [["Fecha", "Tipo", "Descripcion", "Debito", "Credito", "Saldo"]]
    if ficha.movimientos:
        for item in ficha.movimientos:
            rows.append([
                _fmt_fecha(item.fecha),
                item.tipo,
                _paragraph(item.descripcion, small),
                _fmt_gs(item.debito),
                _fmt_gs(item.credito),
                _fmt_gs(item.saldo_acumulado),
            ])
    else:
        rows.append(["-", "-", "Sin movimientos", "-", "-", "-"])
    table = Table(rows, colWidths=[2.1 * cm, 1.8 * cm, 7.1 * cm, 2.1 * cm, 2.1 * cm, 2.1 * cm], repeatRows=1)
    _style_table(table)
    table.setStyle(TableStyle([("ALIGN", (3, 1), (5, -1), "RIGHT"), ("ALIGN", (1, 1), (1, -1), "CENTER")]))
    story.extend([table, Spacer(1, 0.35 * cm)])

    story.append(Paragraph("<b>Historial de armazones</b>", styles["Heading3"]))
    rows = [["Fecha", "Armazon", "Cod.", "Medidas", "Precio", "Venta", "Receta"]]
    if ficha.historial_armazones:
        for item in ficha.historial_armazones:
            receta = "-"
            if item.graduacion:
                receta = f"{_fmt_fecha(item.graduacion.fecha_receta)} | {item.graduacion.doctor or '-'}"
            rows.append([
                _fmt_fecha(item.fecha),
                _paragraph(item.producto, small),
                item.codigo_armazon or item.codigo_producto or "-",
                item.medidas or "-",
                _fmt_gs(item.precio_venta),
                item.venta_codigo or "-",
                _paragraph(receta, small),
            ])
    else:
        rows.append(["-", "Sin historial de armazones", "-", "-", "-", "-", "-"])
    table = Table(rows, colWidths=[1.9 * cm, 4.5 * cm, 2.0 * cm, 2.1 * cm, 2.2 * cm, 1.8 * cm, 3.2 * cm], repeatRows=1)
    _style_table(table)
    table.setStyle(TableStyle([("ALIGN", (4, 1), (4, -1), "RIGHT")]))
    story.append(table)

    doc.build(story)
    buffer.seek(0)
    return buffer


def generar_pdf_ficha_proveedor(ficha, config):
    buffer, doc, styles, small = _build_doc()
    empresa = config.nombre if config and config.nombre else "HESAKA"

    story = [
        Paragraph(f"<b>{empresa}</b>", styles["Title"]),
        Paragraph("Ficha de Proveedor", styles["Heading2"]),
        Spacer(1, 0.25 * cm),
        _build_info_table([
            ["Proveedor", ficha.proveedor.nombre],
            ["Telefono", ficha.proveedor.telefono or "-"],
            ["Email", ficha.proveedor.email or "-"],
            ["Direccion", ficha.proveedor.direccion or "-"],
            ["Deuda total", _fmt_gs(ficha.deuda_total)],
        ]),
        Spacer(1, 0.35 * cm),
    ]

    story.append(Paragraph("<b>Compras pendientes</b>", styles["Heading3"]))
    rows = [["Fecha", "Documento", "Vencimiento", "Total", "Pagado", "Saldo", "Estado"]]
    if ficha.compras_pendientes:
        for item in ficha.compras_pendientes:
            rows.append([
                _fmt_fecha(item.fecha),
                _paragraph(item.documento, small),
                _fmt_fecha(item.fecha_vencimiento),
                _fmt_gs(item.total),
                _fmt_gs(item.pagado),
                _fmt_gs(item.saldo),
                item.estado,
            ])
    else:
        rows.append(["-", "Sin compras pendientes", "-", "-", "-", "-", "-"])
    table = Table(rows, colWidths=[1.9 * cm, 4.4 * cm, 2.2 * cm, 2.2 * cm, 2.2 * cm, 2.2 * cm, 1.8 * cm], repeatRows=1)
    _style_table(table)
    table.setStyle(TableStyle([("ALIGN", (3, 1), (5, -1), "RIGHT"), ("ALIGN", (6, 1), (6, -1), "CENTER")]))
    story.extend([table, Spacer(1, 0.35 * cm)])

    story.append(Paragraph("<b>Estado de cuenta</b>", styles["Heading3"]))
    rows = [["Fecha", "Tipo", "Descripcion", "Pago", "Compra", "Saldo"]]
    if ficha.movimientos:
        for item in ficha.movimientos:
            rows.append([
                _fmt_fecha(item.fecha),
                item.tipo,
                _paragraph(item.descripcion, small),
                _fmt_gs(item.debito),
                _fmt_gs(item.credito),
                _fmt_gs(item.saldo_acumulado),
            ])
    else:
        rows.append(["-", "-", "Sin movimientos", "-", "-", "-"])
    table = Table(rows, colWidths=[2.1 * cm, 1.8 * cm, 7.1 * cm, 2.1 * cm, 2.1 * cm, 2.1 * cm], repeatRows=1)
    _style_table(table)
    table.setStyle(TableStyle([("ALIGN", (3, 1), (5, -1), "RIGHT"), ("ALIGN", (1, 1), (1, -1), "CENTER")]))
    story.append(table)

    doc.build(story)
    buffer.seek(0)
    return buffer
