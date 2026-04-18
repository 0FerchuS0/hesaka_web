import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _gs(value: float) -> str:
    amount = f"{int(round(abs(value or 0))):,}".replace(",", ".")
    prefix = "- " if (value or 0) < 0 else ""
    return f"{prefix}Gs. {amount}"


def generar_pdf_rendicion_jornada(
    rendicion,
    resumen,
    config,
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
        "RendicionTitle",
        parent=styles["Heading1"],
        fontSize=18,
        textColor=colors.HexColor("#2c3e50"),
        alignment=TA_CENTER,
        spaceAfter=12,
        fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "RendicionSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#64748b"),
        alignment=TA_CENTER,
        spaceAfter=8,
    )
    section_style = ParagraphStyle(
        "RendicionSection",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#2563eb"),
        spaceAfter=10,
        fontName="Helvetica-Bold",
    )
    cell_style = ParagraphStyle(
        "RendicionCell",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        alignment=TA_LEFT,
    )

    company_name = config.nombre if (config and config.nombre) else "HESAKA"
    elements = [
        Paragraph(company_name, title_style),
        Paragraph("RENDICION DE JORNADA", title_style),
        Paragraph(f"Fecha y hora: {rendicion.fecha_hora_rendicion.strftime('%d/%m/%Y %H:%M')}", subtitle_style),
        Spacer(1, 0.3 * cm),
    ]

    elements.append(Paragraph("DATOS DE LA RENDICION", section_style))
    resumen_data = [
        ["Campo", "Valor"],
        ["Rendido a", rendicion.rendido_a],
        ["Usuario", rendicion.usuario_nombre or "-"],
        ["Fecha rendicion", rendicion.fecha_hora_rendicion.strftime("%d/%m/%Y %H:%M")],
        ["Monto sugerido", _gs(rendicion.monto_sugerido)],
        ["Monto rendido", _gs(rendicion.monto_rendido)],
        ["Diferencia", _gs((rendicion.monto_rendido or 0) - (rendicion.monto_sugerido or 0))],
        ["Observacion", rendicion.observacion or "Sin observacion"],
    ]
    if getattr(rendicion, "fecha_hora_ultima_edicion", None):
        resumen_data.extend([
            ["Estado", "EDITADA"],
            ["Fecha original", rendicion.fecha_hora_original.strftime("%d/%m/%Y %H:%M") if rendicion.fecha_hora_original else "-"],
            ["Rendido a original", rendicion.rendido_a_original or "-"],
            ["Monto original", _gs(rendicion.monto_rendido_original)],
            ["Editada por", rendicion.usuario_ultima_edicion_nombre or "-"],
            ["Ultima edicion", rendicion.fecha_hora_ultima_edicion.strftime("%d/%m/%Y %H:%M")],
            ["Motivo del ajuste", rendicion.motivo_ajuste or "Sin motivo registrado"],
        ])
    resumen_table = Table(resumen_data, colWidths=[5 * cm, 11 * cm])
    resumen_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(resumen_table)
    elements.append(Spacer(1, 0.6 * cm))

    desglose_medios = list(getattr(resumen, "desglose_medios", []) or [])
    if desglose_medios:
        elements.append(Paragraph("DESGLOSE POR MEDIO", section_style))
        desglose_data = [["Medio", "Ingresos", "Egresos", "Neto", "Movimientos"]]
        for item in desglose_medios:
            desglose_data.append([
                item.get("medio") or "-",
                _gs(item.get("ingresos") or 0),
                _gs(item.get("egresos") or 0),
                _gs(item.get("neto") or 0),
                str(item.get("cantidad_movimientos") or 0),
            ])

        desglose_table = Table(desglose_data, colWidths=[4.2 * cm, 3 * cm, 3 * cm, 3 * cm, 2.2 * cm])
        desglose_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("ALIGN", (1, 1), (3, -1), "RIGHT"),
            ("ALIGN", (4, 1), (4, -1), "CENTER"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ]))
        elements.append(desglose_table)
        elements.append(Spacer(1, 0.6 * cm))

    elements.append(Paragraph("MOVIMIENTOS INCLUIDOS", section_style))
    detail_data = [["Fecha", "Origen", "Medio", "Categoria", "Concepto", "Referencia", "Monto"]]
    for movimiento in resumen.todos:
        color = "#15803d" if movimiento.tipo in {"INGRESO", "AJUSTE (+)"} else "#b91c1c"
        detail_data.append([
            Paragraph(movimiento.fecha.strftime("%d/%m/%Y %H:%M"), cell_style),
            Paragraph(movimiento.origen, cell_style),
            Paragraph(getattr(movimiento, "medio", "-") or "-", cell_style),
            Paragraph(movimiento.categoria, cell_style),
            Paragraph(movimiento.concepto or "-", cell_style),
            Paragraph(movimiento.referencia or "-", cell_style),
            Paragraph(f'<font color="{color}"><b>{_gs(movimiento.monto)}</b></font>', cell_style),
        ])

    detail_table = Table(detail_data, colWidths=[2.1 * cm, 1.4 * cm, 1.9 * cm, 2.3 * cm, 4.5 * cm, 1.9 * cm, 1.9 * cm])
    detail_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
    ]
    detail_table.setStyle(TableStyle(detail_style))
    elements.append(detail_table)

    doc.build(elements)
    buffer.seek(0)
    return buffer
