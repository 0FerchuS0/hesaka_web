import io
import os

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

from app.utils.media_storage import resolve_logo_disk_path


def _fmt_gs(monto):
    try:
        return f"Gs. {int(monto):,}".replace(",", ".")
    except Exception:
        return str(monto)


def _draw_letterhead(c, config, width, height, margin_x):
    logo_width = 1.5 * cm
    logo_height = 1.5 * cm
    letterhead_y = height - 0.5 * cm
    text_x = margin_x

    logo_disk_path = resolve_logo_disk_path(config.logo_path if config else None)
    if logo_disk_path and os.path.exists(logo_disk_path):
        try:
            c.drawImage(
                logo_disk_path,
                margin_x,
                letterhead_y - logo_height,
                width=logo_width,
                height=logo_height,
                preserveAspectRatio=True,
                mask="auto",
            )
            text_x = margin_x + logo_width + 0.4 * cm
        except Exception:
            pass

    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(text_x, letterhead_y - 0.4 * cm, config.nombre if config and config.nombre else "Mi Empresa")

    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    current_y = letterhead_y - 0.7 * cm
    line_height = 0.3 * cm

    if config and config.ruc:
        c.drawString(text_x, current_y, f"RUC: {config.ruc}")
        current_y -= line_height
    if config and config.direccion:
        c.drawString(text_x, current_y, config.direccion)
        current_y -= line_height
    if config and config.telefono:
        c.drawString(text_x, current_y, f"Tel: {config.telefono}")
        current_y -= line_height
    if config and config.email:
        c.drawString(text_x, current_y, f"Email: {config.email}")
        current_y -= line_height


def generar_pdf_presupuesto(presupuesto, config) -> io.BytesIO:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin_x = 2 * cm
    margin_y = 2 * cm
    content_width = width - 2 * margin_x

    _draw_letterhead(c, config, width, height, margin_x)

    start_y = height - margin_y
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(width - margin_x, start_y - 0.5 * cm, "PRESUPUESTO")
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x, start_y - 1.2 * cm, f"No. {presupuesto.codigo}")
    c.setFont("Helvetica", 10)
    c.drawRightString(width - margin_x, start_y - 1.8 * cm, f"Fecha: {presupuesto.fecha.strftime('%d/%m/%Y')}")
    c.drawRightString(width - margin_x, start_y - 2.3 * cm, f"Estado: {presupuesto.estado}")

    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, start_y - 2.8 * cm, width - margin_x, start_y - 2.8 * cm)

    y_start = start_y - 3.5 * cm
    c.line(margin_x, y_start, width - margin_x, y_start)
    cliente = presupuesto.cliente_rel
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin_x, y_start - 0.8 * cm, "DATOS DEL CLIENTE")
    c.setFont("Helvetica", 10)
    c.drawString(margin_x, y_start - 1.4 * cm, f"Nombre: {cliente.nombre if cliente else 'Sin cliente'}")
    c.drawString(margin_x + 10 * cm, y_start - 1.4 * cm, f"Telefono: {cliente.telefono if cliente and cliente.telefono else '-'}")
    c.drawString(margin_x, y_start - 1.9 * cm, f"CI/RUC: {cliente.ci if cliente and cliente.ci else '-'}")
    c.drawString(margin_x + 10 * cm, y_start - 1.9 * cm, f"Direccion: {cliente.direccion if cliente and cliente.direccion else '-'}")

    y_table = y_start - 3.0 * cm
    headers = ["Descripcion", "Cant.", "Precio Unit.", "Desc.", "Subtotal"]
    col_widths = [9.5 * cm, 1.5 * cm, 2.5 * cm, 1.5 * cm, 3 * cm]
    x_positions = [margin_x]
    for col_width in col_widths:
        x_positions.append(x_positions[-1] + col_width)

    c.setFillColorRGB(0.95, 0.95, 0.95)
    c.rect(margin_x, y_table - 0.2 * cm, content_width, 0.8 * cm, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x_positions[0] + 0.2 * cm, y_table, headers[0])
    c.drawRightString(x_positions[2] - 0.2 * cm, y_table, headers[1])
    c.drawRightString(x_positions[3] - 0.2 * cm, y_table, headers[2])
    c.drawRightString(x_positions[4] - 0.2 * cm, y_table, headers[3])
    c.drawRightString(x_positions[5] - 0.2 * cm, y_table, headers[4])

    y_row = y_table - 0.8 * cm
    c.setFont("Helvetica", 8)
    for item in list(presupuesto.items or []):
        descripcion = item.descripcion_personalizada or (item.producto_rel.nombre if item.producto_rel else "Item")
        if y_row < 4 * cm:
            c.showPage()
            _draw_letterhead(c, config, width, height, margin_x)
            y_row = height - margin_y - 1.5 * cm

        c.drawString(x_positions[0] + 0.2 * cm, y_row, descripcion[:55])
        c.drawRightString(x_positions[2] - 0.2 * cm, y_row, str(item.cantidad))
        c.drawRightString(x_positions[3] - 0.2 * cm, y_row, _fmt_gs(item.precio_unitario).replace("Gs. ", ""))
        c.drawRightString(x_positions[4] - 0.2 * cm, y_row, _fmt_gs(item.descuento).replace("Gs. ", ""))
        c.drawRightString(x_positions[5] - 0.2 * cm, y_row, _fmt_gs(item.subtotal).replace("Gs. ", ""))
        c.setStrokeColorRGB(0.9, 0.9, 0.9)
        c.line(margin_x, y_row - 0.18 * cm, width - margin_x, y_row - 0.18 * cm)
        y_row -= 0.6 * cm

    y_total = y_row - 0.8 * cm
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x - 4 * cm, y_total, "TOTAL:")
    c.drawRightString(width - margin_x, y_total, _fmt_gs(presupuesto.total))

    y_extra = y_total - 1.2 * cm
    c.setFont("Helvetica", 9)
    if presupuesto.doctor_receta:
        c.drawString(margin_x, y_extra, f"Doctor: {presupuesto.doctor_receta}")
        y_extra -= 0.5 * cm
    if presupuesto.observaciones:
        c.drawString(margin_x, y_extra, f"Observaciones: {presupuesto.observaciones[:90]}")

    c.save()
    buffer.seek(0)
    return buffer
