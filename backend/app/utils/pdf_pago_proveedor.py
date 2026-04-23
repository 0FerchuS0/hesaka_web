import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from app.utils.timezone import ahora_desde_config


def _fmt_gs(valor):
    return f"{int(valor or 0):,}".replace(",", ".")


def _resumen_multilinea(valores, max_chars_por_linea=42, max_lineas=3):
    items = [str(valor).strip() for valor in (valores or []) if str(valor).strip()]
    if not items:
        return "-"

    lineas = []
    linea_actual = ""
    indice_consumido = 0

    for idx, item in enumerate(items):
        candidato = f"{linea_actual}, {item}" if linea_actual else item
        if len(candidato) <= max_chars_por_linea:
            linea_actual = candidato
            indice_consumido = idx + 1
            continue

        if linea_actual:
            lineas.append(linea_actual)
        else:
            lineas.append(item[:max_chars_por_linea])

        linea_actual = item if len(item) <= max_chars_por_linea else item[:max_chars_por_linea]
        indice_consumido = idx + 1
        if len(lineas) >= max_lineas - 1:
            break

    if len(lineas) < max_lineas and linea_actual:
        lineas.append(linea_actual)

    if indice_consumido < len(items):
        lineas[-1] = f"{lineas[-1]}..."

    return "<br/>".join(lineas[:max_lineas])


def _texto_multilinea(valor, max_chars_por_linea=24, max_lineas=2):
    texto = str(valor or "").strip()
    if not texto:
        return "-"

    segmentos = [segmento.strip() for segmento in texto.split(",") if segmento.strip()] or [texto]
    lineas = []
    linea_actual = ""
    consumidos = 0

    for idx, segmento in enumerate(segmentos):
        candidato = f"{linea_actual}, {segmento}" if linea_actual else segmento
        if len(candidato) <= max_chars_por_linea:
            linea_actual = candidato
            consumidos = idx + 1
            continue

        if linea_actual:
            lineas.append(linea_actual)
        else:
            lineas.append(segmento[:max_chars_por_linea])

        linea_actual = segmento if len(segmento) <= max_chars_por_linea else segmento[:max_chars_por_linea]
        consumidos = idx + 1
        if len(lineas) >= max_lineas - 1:
            break

    if len(lineas) < max_lineas and linea_actual:
        lineas.append(linea_actual)

    if consumidos < len(segmentos):
        lineas[-1] = f"{lineas[-1]}..."

    return "<br/>".join(lineas[:max_lineas])


def generar_pdf_pago_proveedor(grupo, config):
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
        "PagoProveedorCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
    )
    resumen_value_style = ParagraphStyle(
        "PagoProveedorResumenValue",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=10,
        wordWrap="CJK",
    )
    detail_cell_style = ParagraphStyle(
        "PagoProveedorDetailCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.6,
        leading=9,
        wordWrap="CJK",
    )
    detail_money_style = ParagraphStyle(
        "PagoProveedorDetailMoney",
        parent=detail_cell_style,
        alignment=TA_RIGHT,
    )

    company_name = config.nombre if (config and config.nombre) else "HESAKA"
    elementos = [
        Paragraph(company_name, title_style),
        Paragraph("COMPROBANTE DE PAGO A PROVEEDOR", title_style),
        Paragraph(f"Generado: {ahora_desde_config(config).strftime('%d/%m/%Y %H:%M')}", subtitle_style),
        Spacer(1, 0.3 * cm),
    ]

    datos = [
        ["Proveedor", grupo.get("proveedor_nombre") or "SIN PROVEEDOR"],
        ["Fecha", grupo["fecha"].strftime("%d/%m/%Y %H:%M") if grupo.get("fecha") else "-"],
        ["Lote", grupo.get("grupo_id") or "-"],
        ["Total Pagado", f"Gs. {_fmt_gs(grupo.get('total'))}"],
    ]
    tabla_datos = Table(datos, colWidths=[4.2 * cm, 12.8 * cm])
    tabla_datos.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eff6ff")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elementos.extend([tabla_datos, Spacer(1, 0.35 * cm)])

    resumen = [
        ["OS", Paragraph(_resumen_multilinea(grupo.get("os_origen"), max_chars_por_linea=46, max_lineas=3), resumen_value_style)],
        ["Facturas", Paragraph(_resumen_multilinea(grupo.get("facturas"), max_chars_por_linea=46, max_lineas=2), resumen_value_style)],
        ["Clientes", Paragraph(_resumen_multilinea(grupo.get("clientes"), max_chars_por_linea=44, max_lineas=3), resumen_value_style)],
        ["Metodos", Paragraph(_resumen_multilinea(grupo.get("metodos"), max_chars_por_linea=46, max_lineas=2), resumen_value_style)],
        ["Comprobantes", Paragraph(_resumen_multilinea(grupo.get("comprobantes"), max_chars_por_linea=46, max_lineas=2), resumen_value_style)],
    ]
    tabla_resumen = Table(resumen, colWidths=[4.2 * cm, 12.8 * cm])
    tabla_resumen.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elementos.extend([tabla_resumen, Spacer(1, 0.35 * cm)])

    detalle = [["Documento", "OS", "Factura", "Cliente", "Metodo", "Comprobante", "Monto"]]
    for item in grupo.get("detalles", []):
        detalle.append([
            Paragraph(_texto_multilinea(item.get("documento"), max_chars_por_linea=18, max_lineas=2), detail_cell_style),
            Paragraph(_texto_multilinea(item.get("os_origen"), max_chars_por_linea=16, max_lineas=2), detail_cell_style),
            Paragraph(_texto_multilinea(item.get("factura"), max_chars_por_linea=18, max_lineas=2), detail_cell_style),
            Paragraph(_texto_multilinea(item.get("cliente"), max_chars_por_linea=26, max_lineas=3), detail_cell_style),
            Paragraph(_texto_multilinea(item.get("metodo"), max_chars_por_linea=16, max_lineas=2), detail_cell_style),
            Paragraph(_texto_multilinea(item.get("comprobante"), max_chars_por_linea=17, max_lineas=2), detail_cell_style),
            Paragraph(_fmt_gs(item.get("monto")), detail_money_style),
        ])

    tabla_detalle = Table(detalle, colWidths=[2.3 * cm, 2.1 * cm, 2.4 * cm, 4.1 * cm, 2.1 * cm, 2.3 * cm, 2.7 * cm], repeatRows=1)
    tabla_detalle.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("ALIGN", (6, 1), (6, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elementos.extend([
        Paragraph("DETALLE DEL PAGO", styles["Heading2"]),
        tabla_detalle,
    ])

    doc.build(elementos)
    buffer.seek(0)
    return buffer
