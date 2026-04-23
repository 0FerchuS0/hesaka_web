import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from app.utils.timezone import ahora_desde_config


def _fmt_gs(valor):
    return f"{int(valor or 0):,}".replace(",", ".")


def generar_pdf_compra(compra, config):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = styles["Heading1"]
    title_style.fontName = "Helvetica-Bold"
    title_style.fontSize = 16
    title_style.textColor = colors.HexColor("#1f2937")
    subtitle_style = styles["Normal"]
    subtitle_style.fontSize = 9
    subtitle_style.textColor = colors.HexColor("#6b7280")
    cell_style = ParagraphStyle(
        "CompraCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
    )

    company_name = config.nombre if (config and config.nombre) else "HESAKA"
    elementos = [
        Paragraph(company_name, title_style),
        Paragraph("COMPROBANTE DE COMPRA", title_style),
        Paragraph(f"Generado: {ahora_desde_config(config).strftime('%d/%m/%Y %H:%M')}", subtitle_style),
        Spacer(1, 0.3 * cm),
    ]

    datos_compra = [
        ["Proveedor", compra.proveedor_rel.nombre if compra.proveedor_rel else "SIN PROVEEDOR"],
        ["Documento", f"{compra.tipo_documento} {compra.nro_factura or 'S/N'}"],
        ["Fecha", compra.fecha.strftime("%d/%m/%Y %H:%M") if compra.fecha else "-"],
        ["Condicion", compra.condicion_pago or "-"],
        ["Estado", compra.estado or "-"],
        ["Entrega", compra.estado_entrega or "-"],
        ["Tipo de Compra", compra.tipo_compra or "-"],
        ["Ventas Asociadas", ", ".join(rel.venta_rel.codigo for rel in compra.ventas_asociadas if rel.venta_rel) or "-"],
        ["Clientes", ", ".join(sorted({rel.venta_rel.cliente_rel.nombre for rel in compra.ventas_asociadas if rel.venta_rel and rel.venta_rel.cliente_rel})) or "-"],
    ]
    tabla_datos = Table(datos_compra, colWidths=[4.5 * cm, 12 * cm])
    tabla_datos.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eff6ff")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    elementos.extend([tabla_datos, Spacer(1, 0.4 * cm)])

    detalle = [["Descripcion", "Cant.", "Costo Unit.", "Desc.", "Subtotal"]]
    for item in compra.items:
        detalle.append([
            Paragraph(item.descripcion or "-", cell_style),
            str(item.cantidad or 0),
            _fmt_gs(item.costo_unitario),
            _fmt_gs(item.descuento),
            _fmt_gs(item.subtotal),
        ])

    tabla_detalle = Table(detalle, colWidths=[8.5 * cm, 1.6 * cm, 2.4 * cm, 1.8 * cm, 2.7 * cm])
    tabla_detalle.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
    ]))
    elementos.extend([
        Paragraph("DETALLE DE ITEMS", styles["Heading2"]),
        tabla_detalle,
        Spacer(1, 0.4 * cm),
    ])

    pagos = [["Fecha", "Metodo", "Banco", "Comprobante", "Monto"]]
    pagos_compra = [pago for pago in sorted(compra.pagos, key=lambda p: p.fecha) if pago.estado != "ANULADO"]
    if pagos_compra:
        for pago in pagos_compra:
            pagos.append([
                pago.fecha.strftime("%d/%m/%Y %H:%M") if pago.fecha else "-",
                pago.metodo_pago or "-",
                pago.banco_rel.nombre_banco if pago.banco_rel else "-",
                pago.nro_comprobante or "-",
                _fmt_gs(pago.monto),
            ])
        tabla_pagos = Table(pagos, colWidths=[3 * cm, 3 * cm, 4.2 * cm, 3.2 * cm, 2.6 * cm])
        tabla_pagos.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065f46")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0fdf4")]),
            ("ALIGN", (4, 1), (4, -1), "RIGHT"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
        ]))
        elementos.extend([
            Paragraph("HISTORIAL DE PAGOS", styles["Heading2"]),
            tabla_pagos,
            Spacer(1, 0.4 * cm),
        ])

    resumen = [
        ["Total Compra", _fmt_gs(compra.total)],
        ["Saldo Pendiente", _fmt_gs(compra.saldo)],
    ]
    tabla_resumen = Table(resumen, colWidths=[5 * cm, 4 * cm])
    tabla_resumen.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef2ff")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#c7d2fe")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
    ]))
    elementos.append(tabla_resumen)

    if compra.observaciones:
        elementos.extend([
            Spacer(1, 0.35 * cm),
            Paragraph("OBSERVACIONES", styles["Heading2"]),
            Paragraph(compra.observaciones, cell_style),
        ])

    doc.build(elementos)
    buffer.seek(0)
    return buffer
