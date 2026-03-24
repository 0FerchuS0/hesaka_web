import io
import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from app.utils.media_storage import resolve_logo_disk_path

def fmt_gs(monto):
    try:
        return f"Gs. {int(monto):,}".replace(",", ".")
    except:
        return str(monto)

def _draw_letterhead(c, config, width, height):
    """Dibuja el membrete y el logo en la parte superior, estilo original compacto."""
    logo_width = 1.5*cm
    logo_height = 1.5*cm
    letterhead_y = height - 0.5*cm  # Start 0.5cm from top
    text_x = 2 * cm
    
    # Draw Logo if exists
    logo_disk_path = resolve_logo_disk_path(config.logo_path if config else None)
    if logo_disk_path and os.path.exists(logo_disk_path):
        try:
            c.drawImage(logo_disk_path, 2 * cm, letterhead_y - logo_height, 
                       width=logo_width, height=logo_height, 
                       preserveAspectRatio=True, mask='auto')
            text_x = 2 * cm + logo_width + 0.4*cm
        except Exception:
            pass
            
    # Company Details
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(text_x, letterhead_y - 0.4*cm, config.nombre if config and config.nombre else "Mi Empresa")
    
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    
    current_y = letterhead_y - 0.7*cm
    line_height = 0.3*cm
    
    if config and config.ruc:
        c.drawString(text_x, current_y, f"RUC: {config.ruc}")
        current_y -= line_height

    if config and config.direccion:
        c.drawString(text_x, current_y, f"{config.direccion}")
        current_y -= line_height

    if config and config.telefono:
        c.drawString(text_x, current_y, f"Tel: {config.telefono}")
        current_y -= line_height

    if config and config.email:
        c.drawString(text_x, current_y, f"Email: {config.email}")
        current_y -= line_height
    
    c.setFillColorRGB(0, 0, 0)
    return current_y

def generar_recibo_pago_individual(pago, venta, cliente, config) -> io.BytesIO:
    """Genera un recibo PDF para un solo pago."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin_x = 2 * cm
    margin_y = 2 * cm
    
    _draw_letterhead(c, config, width, height)
    
    start_y = height - margin_y
    
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(width - margin_x, start_y - 0.5*cm, "RECIBO DE DINERO")
    
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x, start_y - 1.2*cm, f"Nro Pago: {pago.id:06d}")
    
    c.setFont("Helvetica", 10)
    c.drawRightString(width - margin_x, start_y - 1.8*cm, f"Fecha: {pago.fecha.strftime('%d/%m/%Y %H:%M')}")
    
    # Separator Line
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, start_y - 2.8*cm, width - margin_x, start_y - 2.8*cm)
    
    # Contenido
    y = start_y - 3.5 * cm
    
    c.setFont("Helvetica", 12)
    c.drawString(margin_x, y, f"Recibimos de: {cliente.nombre if cliente else 'Cliente Ocacional'}")
    c.drawString(margin_x, y - 1*cm, f"RUC/CI: {cliente.ci if cliente else '-'}")
    
    c.drawString(margin_x, y - 2.5*cm, f"La suma de: {fmt_gs(pago.monto)}")
    c.drawString(margin_x, y - 3.2*cm, f"Método: {pago.metodo_pago}")
    
    c.drawString(margin_x, y - 4.2*cm, f"Concepto: Pago por Venta Nro {venta.codigo}")
    
    if pago.nota:
        c.drawString(margin_x, y - 5.5*cm, f"Nota: {pago.nota}")
        
    c.drawString(margin_x, y - 7*cm, f"Saldo Pendiente: {fmt_gs(venta.saldo)}")
    
    # Footer
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(width/2, 1.5*cm, "Gracias por su preferencia")
    
    c.save()
    buffer.seek(0)
    return buffer


def generar_recibo_venta_consolidado(venta, cliente, pagos, config) -> io.BytesIO:
    """Genera un recibo de la venta y compras. Recreado idéntico al desktop."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin_x = 2 * cm
    margin_y = 2 * cm
    content_width = width - 2 * margin_x
    
    _draw_letterhead(c, config, width, height)
    start_y = height - margin_y
    
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(width - margin_x, start_y - 0.5*cm, "COMPROBANTE DE VENTA")
    
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x, start_y - 1.2*cm, f"No. {venta.codigo}")
    
    c.setFont("Helvetica", 10)
    c.drawRightString(width - margin_x, start_y - 1.8*cm, f"Fecha: {venta.fecha.strftime('%d/%m/%Y')}")
    c.drawRightString(width - margin_x, start_y - 2.3*cm, f"Estado: {venta.estado}")
    
    # Separator Line
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, start_y - 2.8*cm, width - margin_x, start_y - 2.8*cm)
    
    y_start = start_y - 3.5*cm
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, y_start, width - margin_x, y_start)
    
    y_text = y_start - 0.8*cm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin_x, y_text, "DATOS DEL CLIENTE")
    
    c.setFont("Helvetica", 10)
    y_text -= 0.6*cm
    
    nombre_cliente = cliente.nombre if cliente else "Sin cliente"
    c.drawString(margin_x, y_text, f"Nombre: {nombre_cliente}")
    c.drawString(margin_x + 10*cm, y_text, f"Teléfono: {(cliente.telefono if cliente else '-')}")
    
    y_text -= 0.5*cm
    c.drawString(margin_x, y_text, f"CI/RUC: {(cliente.ci if cliente else '-')}")
    c.drawString(margin_x + 10*cm, y_text, f"Dirección: {(cliente.direccion if cliente else '-')}")
    
    y_table = y_text - 1.5*cm
    
    # -- Items Table --
    headers = ["Descripción", "Cant.", "Precio Unit.", "Desc.", "Subtotal"]
    col_widths = [9.5*cm, 1.5*cm, 2.5*cm, 1.5*cm, 3*cm] 
    x_positions = [margin_x]
    for w in col_widths:
        x_positions.append(x_positions[-1] + w)
        
    c.setFillColorRGB(0.95, 0.95, 0.95)
    c.rect(margin_x, y_table - 0.2*cm, content_width, 0.8*cm, fill=1, stroke=0)
    
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x_positions[0] + 0.2*cm, y_table, headers[0]) 
    c.drawRightString(x_positions[2] - 0.2*cm, y_table, headers[1]) 
    c.drawRightString(x_positions[3] - 0.2*cm, y_table, headers[2]) 
    c.drawRightString(x_positions[4] - 0.2*cm, y_table, headers[3]) 
    c.drawRightString(x_positions[5] - 0.2*cm, y_table, headers[4]) 
    
    y_row = y_table - 0.8*cm
    
    items = []
    if venta.presupuesto_rel:
        items = venta.presupuesto_rel.items

    desc_style = ParagraphStyle('ItemDescription', fontName='Helvetica', fontSize=8, leading=10, alignment=TA_LEFT)
    
    for item in items:
        nombre = item.descripcion_personalizada if (hasattr(item, 'descripcion_personalizada') and item.descripcion_personalizada) else item.producto_rel.nombre
        desc_paragraph = Paragraph(nombre, desc_style)
        
        desc_width = col_widths[0] - 0.4*cm 
        desc_height = desc_paragraph.wrap(desc_width, 100*cm)[1] 
        row_height = max(0.6*cm, desc_height + 0.2*cm)
        
        if y_row - row_height < 4*cm:
            c.showPage()
            y_row = height - margin_y
            c.setFillColorRGB(0.95, 0.95, 0.95)
            c.rect(margin_x, y_row - 0.2*cm, content_width, 0.8*cm, fill=1, stroke=0)
            c.setFillColorRGB(0, 0, 0)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x_positions[0] + 0.2*cm, y_row, headers[0])
            c.drawRightString(x_positions[2] - 0.2*cm, y_row, headers[1])
            c.drawRightString(x_positions[3] - 0.2*cm, y_row, headers[2])
            c.drawRightString(x_positions[4] - 0.2*cm, y_row, headers[3])
            c.drawRightString(x_positions[5] - 0.2*cm, y_row, headers[4])
            y_row -= 0.8*cm
        
        desc_paragraph.drawOn(c, x_positions[0] + 0.2*cm, y_row - desc_height + 0.1*cm)
        
        c.setFont("Helvetica", 8)
        c.drawRightString(x_positions[2] - 0.2*cm, y_row, str(item.cantidad))
        c.drawRightString(x_positions[3] - 0.2*cm, y_row, "{:,.0f}".format(item.precio_unitario).replace(",", "."))
        c.drawRightString(x_positions[4] - 0.2*cm, y_row, "{:,.0f}".format(item.descuento).replace(",", "."))
        c.drawRightString(x_positions[5] - 0.2*cm, y_row, "{:,.0f}".format(item.subtotal).replace(",", "."))
        
        c.setStrokeColorRGB(0.9, 0.9, 0.9)
        c.line(margin_x, y_row - row_height + 0.4*cm, width - margin_x, y_row - row_height + 0.4*cm)
        y_row -= row_height

    y_total = y_row - 0.5*cm
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x - 4*cm, y_total, "TOTAL:")
    c.drawRightString(width - margin_x, y_total, "{:,.0f} Gs.".format(venta.total).replace(",", "."))
    
    # --- Payment History ---
    y_hist = y_total - 2*cm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin_x, y_hist, "HISTORIAL DE PAGOS")
    
    y_hist -= 0.8*cm
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.rect(margin_x, y_hist - 0.2*cm, content_width, 0.7*cm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    
    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin_x + 0.2*cm, y_hist, "Fecha")
    c.drawString(margin_x + 4*cm, y_hist, "Método")
    c.drawString(margin_x + 9*cm, y_hist, "Nota")
    c.drawRightString(width - margin_x - 0.2*cm, y_hist, "Monto")
    
    c.setFillColorRGB(0, 0, 0)
    y_hist -= 0.8*cm
    
    total_pagado = 0
    nota_style = ParagraphStyle('PaymentNote', fontName='Helvetica', fontSize=9, leading=11, alignment=TA_LEFT)
    
    c.setFont("Helvetica", 9)
    for pago in pagos:
        nota_text = pago.nota if pago.nota else "-"
        nota_paragraph = Paragraph(nota_text, nota_style)
        
        nota_width = (width - margin_x) - (margin_x + 9*cm) - 0.4*cm
        nota_height = nota_paragraph.wrap(nota_width, 100*cm)[1]
        row_height = max(0.6*cm, nota_height + 0.2*cm)
        
        if y_hist - row_height < 3*cm:
            c.showPage()
            y_hist = height - margin_y

        c.drawString(margin_x + 0.2*cm, y_hist, pago.fecha.strftime("%d/%m/%Y"))
        c.drawString(margin_x + 4*cm, y_hist, pago.metodo_pago)
        nota_paragraph.drawOn(c, margin_x + 9*cm, y_hist - nota_height + 0.3*cm)
        c.drawRightString(width - margin_x - 0.2*cm, y_hist, "{:,.0f}".format(pago.monto).replace(",", "."))
        
        y_hist -= row_height
        total_pagado += pago.monto
        
    y_hist -= 0.5*cm
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(width - margin_x - 4*cm, y_hist, "Total Pagado:")
    c.drawRightString(width - margin_x, y_hist, "{:,.0f} Gs.".format(total_pagado).replace(",", "."))
    
    y_hist -= 0.6*cm
    c.setFillColorRGB(0.8, 0.2, 0.2)
    c.drawRightString(width - margin_x - 4*cm, y_hist, "Saldo Pendiente:")
    c.drawRightString(width - margin_x, y_hist, "{:,.0f} Gs.".format(venta.saldo).replace(",", "."))
    c.setFillColorRGB(0, 0, 0)

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(width / 2, 1.5 * cm, "Gracias por su preferencia")
    
    c.save()
    buffer.seek(0)
    return buffer


def _draw_recibo_venta_consolidado_en_canvas(c, venta, cliente, pagos, config):
    width, height = A4
    margin_x = 2 * cm
    margin_y = 2 * cm
    content_width = width - 2 * margin_x

    _draw_letterhead(c, config, width, height)
    start_y = height - margin_y

    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(width - margin_x, start_y - 0.5*cm, "COMPROBANTE DE VENTA")

    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x, start_y - 1.2*cm, f"No. {venta.codigo}")

    c.setFont("Helvetica", 10)
    c.drawRightString(width - margin_x, start_y - 1.8*cm, f"Fecha: {venta.fecha.strftime('%d/%m/%Y')}")
    c.drawRightString(width - margin_x, start_y - 2.3*cm, f"Estado: {venta.estado}")

    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, start_y - 2.8*cm, width - margin_x, start_y - 2.8*cm)

    y_start = start_y - 3.5*cm
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, y_start, width - margin_x, y_start)

    y_text = y_start - 0.8*cm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin_x, y_text, "DATOS DEL CLIENTE")

    c.setFont("Helvetica", 10)
    y_text -= 0.6*cm

    nombre_cliente = cliente.nombre if cliente else "Sin cliente"
    c.drawString(margin_x, y_text, f"Nombre: {nombre_cliente}")
    c.drawString(margin_x + 10*cm, y_text, f"TelÃ©fono: {(cliente.telefono if cliente else '-')}")

    y_text -= 0.5*cm
    c.drawString(margin_x, y_text, f"CI/RUC: {(cliente.ci if cliente else '-')}")
    c.drawString(margin_x + 10*cm, y_text, f"DirecciÃ³n: {(cliente.direccion if cliente else '-')}")

    y_table = y_text - 1.5*cm

    headers = ["DescripciÃ³n", "Cant.", "Precio Unit.", "Desc.", "Subtotal"]
    col_widths = [9.5*cm, 1.5*cm, 2.5*cm, 1.5*cm, 3*cm]
    x_positions = [margin_x]
    for w in col_widths:
        x_positions.append(x_positions[-1] + w)

    c.setFillColorRGB(0.95, 0.95, 0.95)
    c.rect(margin_x, y_table - 0.2*cm, content_width, 0.8*cm, fill=1, stroke=0)

    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x_positions[0] + 0.2*cm, y_table, headers[0])
    c.drawRightString(x_positions[2] - 0.2*cm, y_table, headers[1])
    c.drawRightString(x_positions[3] - 0.2*cm, y_table, headers[2])
    c.drawRightString(x_positions[4] - 0.2*cm, y_table, headers[3])
    c.drawRightString(x_positions[5] - 0.2*cm, y_table, headers[4])

    y_row = y_table - 0.8*cm
    items = venta.presupuesto_rel.items if venta.presupuesto_rel else []
    desc_style = ParagraphStyle('ItemDescriptionMultiple', fontName='Helvetica', fontSize=8, leading=10, alignment=TA_LEFT)

    for item in items:
        nombre = item.descripcion_personalizada if (hasattr(item, 'descripcion_personalizada') and item.descripcion_personalizada) else item.producto_rel.nombre
        desc_paragraph = Paragraph(nombre, desc_style)

        desc_width = col_widths[0] - 0.4*cm
        desc_height = desc_paragraph.wrap(desc_width, 100*cm)[1]
        row_height = max(0.6*cm, desc_height + 0.2*cm)

        if y_row - row_height < 4*cm:
            c.showPage()
            _draw_letterhead(c, config, width, height)
            y_row = height - margin_y - 3.5*cm
            c.setFillColorRGB(0.95, 0.95, 0.95)
            c.rect(margin_x, y_row - 0.2*cm, content_width, 0.8*cm, fill=1, stroke=0)
            c.setFillColorRGB(0, 0, 0)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x_positions[0] + 0.2*cm, y_row, headers[0])
            c.drawRightString(x_positions[2] - 0.2*cm, y_row, headers[1])
            c.drawRightString(x_positions[3] - 0.2*cm, y_row, headers[2])
            c.drawRightString(x_positions[4] - 0.2*cm, y_row, headers[3])
            c.drawRightString(x_positions[5] - 0.2*cm, y_row, headers[4])
            y_row -= 0.8*cm

        desc_paragraph.drawOn(c, x_positions[0] + 0.2*cm, y_row - desc_height + 0.1*cm)

        c.setFont("Helvetica", 8)
        c.drawRightString(x_positions[2] - 0.2*cm, y_row, str(item.cantidad))
        c.drawRightString(x_positions[3] - 0.2*cm, y_row, "{:,.0f}".format(item.precio_unitario).replace(",", "."))
        c.drawRightString(x_positions[4] - 0.2*cm, y_row, "{:,.0f}".format(item.descuento).replace(",", "."))
        c.drawRightString(x_positions[5] - 0.2*cm, y_row, "{:,.0f}".format(item.subtotal).replace(",", "."))

        c.setStrokeColorRGB(0.9, 0.9, 0.9)
        c.line(margin_x, y_row - row_height + 0.4*cm, width - margin_x, y_row - row_height + 0.4*cm)
        y_row -= row_height

    y_total = y_row - 0.5*cm
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x - 4*cm, y_total, "TOTAL:")
    c.drawRightString(width - margin_x, y_total, "{:,.0f} Gs.".format(venta.total).replace(",", "."))

    y_hist = y_total - 2*cm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin_x, y_hist, "HISTORIAL DE PAGOS")

    y_hist -= 0.8*cm
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.rect(margin_x, y_hist - 0.2*cm, content_width, 0.7*cm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)

    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin_x + 0.2*cm, y_hist, "Fecha")
    c.drawString(margin_x + 4*cm, y_hist, "MÃ©todo")
    c.drawString(margin_x + 9*cm, y_hist, "Nota")
    c.drawRightString(width - margin_x - 0.2*cm, y_hist, "Monto")

    c.setFillColorRGB(0, 0, 0)
    y_hist -= 0.8*cm

    total_pagado = 0
    nota_style = ParagraphStyle('PaymentNoteMultiple', fontName='Helvetica', fontSize=9, leading=11, alignment=TA_LEFT)

    c.setFont("Helvetica", 9)
    for pago in pagos:
        nota_text = pago.nota if pago.nota else "-"
        nota_paragraph = Paragraph(nota_text, nota_style)
        nota_width = (width - margin_x) - (margin_x + 9*cm) - 0.4*cm
        nota_height = nota_paragraph.wrap(nota_width, 100*cm)[1]
        row_height = max(0.6*cm, nota_height + 0.2*cm)

        if y_hist - row_height < 3*cm:
            c.showPage()
            _draw_letterhead(c, config, width, height)
            y_hist = height - margin_y

        c.drawString(margin_x + 0.2*cm, y_hist, pago.fecha.strftime("%d/%m/%Y"))
        c.drawString(margin_x + 4*cm, y_hist, pago.metodo_pago)
        nota_paragraph.drawOn(c, margin_x + 9*cm, y_hist - nota_height + 0.3*cm)
        c.drawRightString(width - margin_x - 0.2*cm, y_hist, "{:,.0f}".format(pago.monto).replace(",", "."))

        y_hist -= row_height
        total_pagado += pago.monto

    y_hist -= 0.5*cm
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(width - margin_x - 4*cm, y_hist, "Total Pagado:")
    c.drawRightString(width - margin_x, y_hist, "{:,.0f} Gs.".format(total_pagado).replace(",", "."))

    y_hist -= 0.6*cm
    c.setFillColorRGB(0.8, 0.2, 0.2)
    c.drawRightString(width - margin_x - 4*cm, y_hist, "Saldo Pendiente:")
    c.drawRightString(width - margin_x, y_hist, "{:,.0f} Gs.".format(venta.saldo).replace(",", "."))
    c.setFillColorRGB(0, 0, 0)

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(width / 2, 1.5 * cm, "Gracias por su preferencia")


def generar_recibos_ventas_concatenado(ventas_data, config) -> io.BytesIO:
    """Genera un solo comprobante consolidado a partir de múltiples ventas."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin_x = 2 * cm
    margin_y = 2 * cm
    content_width = width - 2 * margin_x

    _draw_letterhead(c, config, width, height)
    start_y = height - margin_y

    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(width - margin_x, start_y - 0.5*cm, "COMPROBANTE DE VENTA")

    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x, start_y - 1.2*cm, "CONSOLIDADO")

    fechas = [data["venta"].fecha for data in ventas_data if data.get("venta") and data["venta"].fecha]
    fecha_texto = max(fechas).strftime('%d/%m/%Y') if fechas else datetime.now().strftime('%d/%m/%Y')
    c.setFont("Helvetica", 10)
    c.drawRightString(width - margin_x, start_y - 1.8*cm, f"Fecha: {fecha_texto}")
    c.drawRightString(width - margin_x, start_y - 2.3*cm, f"Ventas: {len(ventas_data)}")

    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, start_y - 2.8*cm, width - margin_x, start_y - 2.8*cm)

    clientes = []
    items_agrupados = {}
    pagos = []
    total_ventas = 0.0
    saldo_total = 0.0

    for data in ventas_data:
        venta = data["venta"]
        cliente = data.get("cliente")
        if cliente:
            clientes.append(cliente)
        total_ventas += venta.total or 0.0
        saldo_total += venta.saldo or 0.0
        pagos.extend(data.get("pagos", []))
        if venta.presupuesto_rel and venta.presupuesto_rel.items:
            for item in venta.presupuesto_rel.items:
                descripcion = item.descripcion_personalizada if getattr(item, "descripcion_personalizada", None) else item.producto_rel.nombre
                key = (descripcion or "").strip().upper()
                if key not in items_agrupados:
                    items_agrupados[key] = {
                        "descripcion": descripcion,
                        "cantidad": 0,
                        "bruto_total": 0.0,
                        "descuento": 0.0,
                        "subtotal": 0.0,
                    }
                items_agrupados[key]["cantidad"] += item.cantidad or 0
                items_agrupados[key]["bruto_total"] += (item.precio_unitario or 0.0) * (item.cantidad or 0)
                items_agrupados[key]["descuento"] += item.descuento or 0.0
                items_agrupados[key]["subtotal"] += item.subtotal or 0.0

    items = []
    for item in items_agrupados.values():
        cantidad = item["cantidad"] or 0
        precio_unitario = (item["bruto_total"] / cantidad) if cantidad else 0.0
        items.append({
            "descripcion": item["descripcion"],
            "cantidad": cantidad,
            "precio_unitario": precio_unitario,
            "descuento": item["descuento"],
            "subtotal": item["subtotal"],
        })
    items.sort(key=lambda item: item["descripcion"])

    nombres_clientes = []
    telefonos = []
    direcciones = []
    cis = []
    for cliente in clientes:
        if cliente.nombre and cliente.nombre not in nombres_clientes:
            nombres_clientes.append(cliente.nombre)
        if cliente.telefono and cliente.telefono not in telefonos:
            telefonos.append(cliente.telefono)
        if cliente.direccion and cliente.direccion not in direcciones:
            direcciones.append(cliente.direccion)
        if cliente.ci and cliente.ci not in cis:
            cis.append(cliente.ci)

    y_start = start_y - 3.5*cm
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, y_start, width - margin_x, y_start)

    y_text = y_start - 0.8*cm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin_x, y_text, "DATOS DEL CLIENTE")

    y_text -= 0.6*cm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin_x, y_text, "Nombre:")
    c.setFont("Helvetica", 10)

    nombre_style = ParagraphStyle('ClientesConsolidados', fontName='Helvetica', fontSize=10, leading=12, alignment=TA_LEFT)
    nombres_paragraph = Paragraph("<br/>".join(nombres_clientes) if nombres_clientes else "Sin cliente", nombre_style)
    nombres_width = 8.5 * cm
    nombres_height = nombres_paragraph.wrap(nombres_width, 100*cm)[1]
    nombres_paragraph.drawOn(c, margin_x + 2.2*cm, y_text - nombres_height + 0.25*cm)

    telefono_texto = telefonos[0] if len(telefonos) == 1 else "-"
    direccion_texto = direcciones[0] if len(direcciones) == 1 else "-"
    ci_texto = cis[0] if len(cis) == 1 else ("Varios" if cis else "-")

    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin_x + 10*cm, y_text, "Teléfono:")
    c.setFont("Helvetica", 10)
    c.drawString(margin_x + 12.2*cm, y_text, telefono_texto)

    y_ci = y_text - max(0.65*cm, nombres_height)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin_x, y_ci, "CI/RUC:")
    c.setFont("Helvetica", 10)
    c.drawString(margin_x + 2.2*cm, y_ci, ci_texto)

    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin_x + 10*cm, y_ci, "Dirección:")
    c.setFont("Helvetica", 10)
    c.drawString(margin_x + 12.2*cm, y_ci, direccion_texto)

    y_table = y_ci - 1.4*cm

    headers = ["Descripción", "Cant.", "Precio Unit.", "Desc.", "Subtotal"]
    col_widths = [9.5*cm, 1.5*cm, 2.5*cm, 1.5*cm, 3*cm]
    x_positions = [margin_x]
    for w in col_widths:
        x_positions.append(x_positions[-1] + w)

    def draw_items_header(y_pos):
        c.setFillColorRGB(0.95, 0.95, 0.95)
        c.rect(margin_x, y_pos - 0.2*cm, content_width, 0.8*cm, fill=1, stroke=0)
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(x_positions[0] + 0.2*cm, y_pos, headers[0])
        c.drawRightString(x_positions[2] - 0.2*cm, y_pos, headers[1])
        c.drawRightString(x_positions[3] - 0.2*cm, y_pos, headers[2])
        c.drawRightString(x_positions[4] - 0.2*cm, y_pos, headers[3])
        c.drawRightString(x_positions[5] - 0.2*cm, y_pos, headers[4])

    draw_items_header(y_table)
    y_row = y_table - 0.8*cm
    desc_style = ParagraphStyle('DescripcionConsolidada', fontName='Helvetica', fontSize=8, leading=10, alignment=TA_LEFT)

    for item in items:
        desc_paragraph = Paragraph(item["descripcion"], desc_style)
        desc_width = col_widths[0] - 0.4*cm
        desc_height = desc_paragraph.wrap(desc_width, 100*cm)[1]
        row_height = max(0.6*cm, desc_height + 0.2*cm)

        if y_row - row_height < 5*cm:
            c.showPage()
            _draw_letterhead(c, config, width, height)
            y_row = height - margin_y - 0.8*cm
            draw_items_header(y_row)
            y_row -= 0.8*cm

        desc_paragraph.drawOn(c, x_positions[0] + 0.2*cm, y_row - desc_height + 0.1*cm)
        c.setFont("Helvetica", 8)
        c.drawRightString(x_positions[2] - 0.2*cm, y_row, str(item["cantidad"]))
        c.drawRightString(x_positions[3] - 0.2*cm, y_row, "{:,.0f}".format(item["precio_unitario"]).replace(",", "."))
        c.drawRightString(x_positions[4] - 0.2*cm, y_row, "{:,.0f}".format(item["descuento"]).replace(",", "."))
        c.drawRightString(x_positions[5] - 0.2*cm, y_row, "{:,.0f}".format(item["subtotal"]).replace(",", "."))
        c.setStrokeColorRGB(0.9, 0.9, 0.9)
        c.line(margin_x, y_row - row_height + 0.4*cm, width - margin_x, y_row - row_height + 0.4*cm)
        y_row -= row_height

    y_total = y_row - 0.6*cm
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(width - margin_x - 4.2*cm, y_total, "TOTAL:")
    c.drawRightString(width - margin_x, y_total, "{:,.0f} Gs.".format(total_ventas).replace(",", "."))

    y_hist = y_total - 2.4*cm
    if y_hist < 5*cm:
        c.showPage()
        _draw_letterhead(c, config, width, height)
        y_hist = height - margin_y - 0.5*cm

    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin_x, y_hist, "HISTORIAL DE PAGOS")

    y_hist -= 0.8*cm
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.rect(margin_x, y_hist - 0.2*cm, content_width, 0.7*cm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin_x + 0.2*cm, y_hist, "Fecha")
    c.drawString(margin_x + 4*cm, y_hist, "Método")
    c.drawString(margin_x + 9*cm, y_hist, "Nota")
    c.drawRightString(width - margin_x - 0.2*cm, y_hist, "Monto")

    c.setFillColorRGB(0, 0, 0)
    y_hist -= 0.8*cm
    pagos_ordenados = sorted(
        pagos,
        key=lambda pago: pago.fecha or datetime.min,
        reverse=True,
    )
    nota_style = ParagraphStyle('NotaPagoConsolidado', fontName='Helvetica', fontSize=9, leading=11, alignment=TA_LEFT)
    total_pagado = 0.0

    for pago in pagos_ordenados:
        nota_text = pago.nota if pago.nota else "-"
        nota_paragraph = Paragraph(nota_text, nota_style)
        nota_width = (width - margin_x) - (margin_x + 9*cm) - 0.4*cm
        nota_height = nota_paragraph.wrap(nota_width, 100*cm)[1]
        row_height = max(0.6*cm, nota_height + 0.2*cm)

        if y_hist - row_height < 3*cm:
            c.showPage()
            _draw_letterhead(c, config, width, height)
            y_hist = height - margin_y - 0.5*cm
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.rect(margin_x, y_hist - 0.2*cm, content_width, 0.7*cm, fill=1, stroke=0)
            c.setFillColorRGB(1, 1, 1)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(margin_x + 0.2*cm, y_hist, "Fecha")
            c.drawString(margin_x + 4*cm, y_hist, "Método")
            c.drawString(margin_x + 9*cm, y_hist, "Nota")
            c.drawRightString(width - margin_x - 0.2*cm, y_hist, "Monto")
            c.setFillColorRGB(0, 0, 0)
            y_hist -= 0.8*cm

        fecha_pago = pago.fecha.strftime("%d/%m/%Y") if pago.fecha else "-"
        c.setFont("Helvetica", 9)
        c.drawString(margin_x + 0.2*cm, y_hist, fecha_pago)
        c.drawString(margin_x + 4*cm, y_hist, pago.metodo_pago or "-")
        nota_paragraph.drawOn(c, margin_x + 9*cm, y_hist - nota_height + 0.3*cm)
        c.drawRightString(width - margin_x - 0.2*cm, y_hist, "{:,.0f}".format(pago.monto).replace(",", "."))
        y_hist -= row_height
        total_pagado += pago.monto or 0.0

    y_hist -= 0.5*cm
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x - 4*cm, y_hist, "Total Pagado:")
    c.drawRightString(width - margin_x, y_hist, "{:,.0f} Gs.".format(total_pagado).replace(",", "."))

    y_hist -= 0.7*cm
    c.setFillColorRGB(0.8, 0.2, 0.2)
    c.drawRightString(width - margin_x - 4*cm, y_hist, "Saldo Pendiente:")
    c.drawRightString(width - margin_x, y_hist, "{:,.0f} Gs.".format(saldo_total).replace(",", "."))
    c.setFillColorRGB(0, 0, 0)

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(width / 2, 1.5 * cm, "Gracias por su preferencia")

    c.save()
    buffer.seek(0)
    return buffer


def generar_recibo_cobro_multiple(grupo_pagos, config, total, metodopago, nota) -> io.BytesIO:
    """Genera un recibo PDF consolidado para un cobro múltiple."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin_x = 2 * cm
    margin_y = 2 * cm
    content_width = width - 2 * margin_x
    
    _draw_letterhead(c, config, width, height)
    start_y = height - margin_y
    
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(width - margin_x, start_y - 0.5*cm, "RECIBO DE COBRO MÚLTIPLE")
    
    if not grupo_pagos:
        c.save()
        buffer.seek(0)
        return buffer
        
    primer_pago = grupo_pagos[0]
    grupo_id = primer_pago.grupo_pago_id or "S/N"
    fecha_grupo = primer_pago.fecha.strftime('%d/%m/%Y %H:%M')
    
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x, start_y - 1.2*cm, f"Grupo No. {grupo_id}")
    
    c.setFont("Helvetica", 10)
    c.drawRightString(width - margin_x, start_y - 1.8*cm, f"Fecha: {fecha_grupo}")
    c.drawRightString(width - margin_x, start_y - 2.3*cm, f"Método: {metodopago}")
    
    # Separator Line
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, start_y - 2.8*cm, width - margin_x, start_y - 2.8*cm)
    
    y_start = start_y - 3.5*cm
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, y_start, width - margin_x, y_start)
    
    y_text = y_start - 0.8*cm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin_x, y_text, "DETALLES DE COBRO MÚLTIPLE")
    
    if nota:
        y_text -= 0.6*cm
        c.setFont("Helvetica", 10)
        c.drawString(margin_x, y_text, f"Nota: {nota}")
        
    y_table = y_text - 1.5*cm
    
    # -- Table --
    headers = ["Venta", "Cliente", "Monto Pagado"]
    col_widths = [4*cm, 9.5*cm, 3.5*cm] 
    x_positions = [margin_x]
    for w in col_widths:
        x_positions.append(x_positions[-1] + w)
        
    c.setFillColorRGB(0.95, 0.95, 0.95)
    c.rect(margin_x, y_table - 0.2*cm, content_width, 0.8*cm, fill=1, stroke=0)
    
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x_positions[0] + 0.2*cm, y_table, headers[0]) 
    c.drawString(x_positions[1] + 0.2*cm, y_table, headers[1]) 
    c.drawRightString(width - margin_x - 0.2*cm, y_table, headers[2])
    
    y_row = y_table - 0.8*cm
    
    c.setFont("Helvetica", 9)
    cliente_style = ParagraphStyle('ClienteDesc', fontName='Helvetica', fontSize=9, leading=11, alignment=TA_LEFT)
    
    for pago in grupo_pagos:
        venta = pago.venta_rel
        codigo_venta = venta.codigo if venta else "S/C"
        cliente = venta.cliente_rel if venta else None
        nombre_cliente = cliente.nombre if cliente else "Sin Cliente"
        
        cliente_paragraph = Paragraph(nombre_cliente, cliente_style)
        cliente_width = col_widths[1] - 0.4*cm
        cliente_height = cliente_paragraph.wrap(cliente_width, 100*cm)[1]
        
        row_height = max(0.6*cm, cliente_height + 0.2*cm)
        
        if y_row - row_height < 3*cm:
            c.showPage()
            y_row = height - margin_y
            c.setFillColorRGB(0.95, 0.95, 0.95)
            c.rect(margin_x, y_row - 0.2*cm, content_width, 0.8*cm, fill=1, stroke=0)
            c.setFillColorRGB(0, 0, 0)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x_positions[0] + 0.2*cm, y_row, headers[0])
            c.drawString(x_positions[1] + 0.2*cm, y_row, headers[1])
            c.drawRightString(width - margin_x - 0.2*cm, y_row, headers[2])
            y_row -= 0.8*cm
            c.setFont("Helvetica", 9)
            
        c.drawString(x_positions[0] + 0.2*cm, y_row, codigo_venta)
        cliente_paragraph.drawOn(c, x_positions[1] + 0.2*cm, y_row - cliente_height + 0.3*cm)
        c.drawRightString(width - margin_x - 0.2*cm, y_row, "{:,.0f} Gs.".format(pago.monto).replace(",", "."))
        
        c.setStrokeColorRGB(0.9, 0.9, 0.9)
        c.line(margin_x, y_row - row_height + 0.4*cm, width - margin_x, y_row - row_height + 0.4*cm)
        
        y_row -= row_height

    y_row -= 0.5*cm
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x - 4*cm, y_row, "Total Pagado:")
    c.drawRightString(width - margin_x, y_row, "{:,.0f} Gs.".format(total).replace(",", "."))
    
    # --- Footer ---
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(width / 2, 1.5 * cm, "Gracias por su preferencia")
    
    c.save()
    buffer.seek(0)
    return buffer


def generar_recibo_cobro_multiple_detallado(grupo_pagos, config, total, metodopago, nota) -> io.BytesIO:
    """Genera un recibo PDF consolidado DETALLADO para un cobro múltiple."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin_x = 2 * cm
    margin_y = 2 * cm
    content_width = width - 2 * margin_x
    
    _draw_letterhead(c, config, width, height)
    start_y = height - margin_y
    
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(width - margin_x, start_y - 0.5*cm, "RECIBO DE COBRO MÚLTIPLE (DETALLADO)")
    
    if not grupo_pagos:
        c.save()
        buffer.seek(0)
        return buffer
        
    primer_pago = grupo_pagos[0]
    grupo_id = primer_pago.grupo_pago_id or "S/N"
    fecha_grupo = primer_pago.fecha.strftime('%d/%m/%Y %H:%M')
    
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x, start_y - 1.2*cm, f"Grupo No. {grupo_id}")
    
    c.setFont("Helvetica", 10)
    c.drawRightString(width - margin_x, start_y - 1.8*cm, f"Fecha: {fecha_grupo}")
    c.drawRightString(width - margin_x, start_y - 2.3*cm, f"Método: {metodopago}")
    
    # Process payments to extract products and clients
    clientes_names = set()
    productos_agg = {}
    
    for p in grupo_pagos:
        venta = p.venta_rel
        if not venta:
            continue
            
        cliente_nom = venta.cliente_rel.nombre if venta.cliente_rel else "Desconocido"
        clientes_names.add(cliente_nom)
        
        if venta.presupuesto_rel and venta.presupuesto_rel.items:
            for item in venta.presupuesto_rel.items:
                prod_cod = item.producto_rel.codigo if item.producto_rel else "N/A"
                prod_nombre = item.producto_rel.nombre if item.producto_rel else "Desconocido"
                
                key = prod_cod
                if key not in productos_agg:
                    productos_agg[key] = {
                        'codigo': prod_cod,
                        'nombre': prod_nombre,
                        'cantidad': 0,
                        'precio_unitario': item.precio_unitario,
                        'total': 0
                    }
                
                productos_agg[key]['cantidad'] += item.cantidad
                productos_agg[key]['total'] += item.subtotal
    
    items_productos = list(productos_agg.values())
    items_productos.sort(key=lambda x: x['nombre'])
    clientes_str = ", ".join(sorted(list(clientes_names)))
    
    # Separator Line
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, start_y - 2.8*cm, width - margin_x, start_y - 2.8*cm)
    
    y_start = start_y - 3.5*cm
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(1)
    c.line(margin_x, y_start, width - margin_x, y_start)
    
    y_text = y_start - 0.8*cm
    c.setFillColorRGB(0, 0, 0)
    
    # Recibimos de
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin_x, y_text, "Clientes:")
    c.setFont("Helvetica", 11)
    
    # Wrap client text
    client_text = clientes_str
    MAX_CHAR_WIDTH = 75
    lines = []
    while len(client_text) > MAX_CHAR_WIDTH:
        split_idx = client_text.rfind(' ', 0, MAX_CHAR_WIDTH)
        if split_idx == -1: split_idx = MAX_CHAR_WIDTH
        lines.append(client_text[:split_idx])
        client_text = client_text[split_idx:].strip()
    lines.append(client_text)
    
    for i, line in enumerate(lines):
        c.drawString(margin_x + 2*cm, y_text, line)
        if i < len(lines) - 1:
            y_text -= 0.5*cm
            
    if nota:
        y_text -= 0.6*cm
        c.setFont("Helvetica", 10)
        c.drawString(margin_x, y_text, f"Nota: {nota}")
        
    y_table = y_text - 1.5*cm
    
    # -- Table Header --
    c.setFillColorRGB(0.95, 0.95, 0.95)
    c.rect(margin_x, y_table - 0.2*cm, content_width, 0.8*cm, fill=1, stroke=0)
    
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin_x + 0.2*cm, y_table, "Cant.") 
    c.drawString(margin_x + 1.5*cm, y_table, "Producto (Código)") 
    c.drawRightString(width - margin_x - 3*cm, y_table, "P. Unit")
    c.drawRightString(width - margin_x - 0.2*cm, y_table, "Total")
    
    y_row = y_table - 0.8*cm
    c.setFont("Helvetica", 9)
    
    for item in items_productos:
        if y_row < 3*cm:
            c.showPage()
            y_row = height - margin_y
            c.setFillColorRGB(0.95, 0.95, 0.95)
            c.rect(margin_x, y_row - 0.2*cm, content_width, 0.8*cm, fill=1, stroke=0)
            c.setFillColorRGB(0, 0, 0)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(margin_x + 0.2*cm, y_row, "Cant.")
            c.drawString(margin_x + 1.5*cm, y_row, "Producto (Código)")
            c.drawRightString(width - margin_x - 3*cm, y_row, "P. Unit")
            c.drawRightString(width - margin_x - 0.2*cm, y_row, "Total")
            y_row -= 0.8*cm
            c.setFont("Helvetica", 9)
            
        c.drawString(margin_x + 0.2*cm, y_row, str(item['cantidad']))
        
        prod_desc = f"{item['nombre']} ({item['codigo']})"
        if len(prod_desc) > 55:
            prod_desc = prod_desc[:55] + "..."
            
        c.drawString(margin_x + 1.5*cm, y_row, prod_desc)
        c.drawRightString(width - margin_x - 3*cm, y_row, "{:,.0f} Gs.".format(item['precio_unitario']).replace(",", "."))
        c.drawRightString(width - margin_x - 0.2*cm, y_row, "{:,.0f} Gs.".format(item['total']).replace(",", "."))
        
        c.setStrokeColorRGB(0.9, 0.9, 0.9)
        c.line(margin_x, y_row - 0.4*cm, width - margin_x, y_row - 0.4*cm)
        
        y_row -= 0.8*cm

    y_row -= 0.5*cm
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - margin_x - 4*cm, y_row, "Total Pagado:")
    c.drawRightString(width - margin_x, y_row, "{:,.0f} Gs.".format(total).replace(",", "."))
    
    # --- Footer ---
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(width / 2, 1.5 * cm, "Gracias por su preferencia")
    
    c.save()
    buffer.seek(0)
    return buffer

