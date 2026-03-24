import io
import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from app.utils.media_storage import resolve_logo_disk_path

def generar_pdf_reporte_ventas(ventas_data, config, fecha_desde=None, fecha_hasta=None, 
                        total_comisiones_referidores=0.0, total_comisiones_bancarias=0.0) -> io.BytesIO:
    """
    Generate professional PDF report for sales with financial metrics, returning BytesIO for FastAPI
    """
    buffer = io.BytesIO()
    
    # Create PDF 
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                           rightMargin=2*cm, leftMargin=2*cm,
                           topMargin=0.8*cm, bottomMargin=2*cm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#2c3e50'),
        spaceAfter=12,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#7f8c8d'),
        spaceAfter=20,
        alignment=TA_CENTER
    )
    
    section_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#3498db'),
        spaceAfter=10,
        fontName='Helvetica-Bold'
    )
    
    cell_style = ParagraphStyle(
        'CellText',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#2c3e50'),
        alignment=TA_LEFT
    )
    
    # --- Header Table (Logo + Info) ---
    logo_img = []
    logo_disk_path = resolve_logo_disk_path(config.logo_path if config else None)
    if logo_disk_path and os.path.exists(logo_disk_path):
        try:
            from reportlab.platypus import Image
            img = Image(logo_disk_path, width=1.5*cm, height=1.5*cm)
            img.hAlign = 'LEFT'
            logo_img.append(img)
        except:
            pass
            
    company_name = config.nombre if (config and config.nombre) else "CENTRO OPTICO SANTA FE"
    
    info_style = ParagraphStyle(
        'HeaderInfo',
        parent=styles['Normal'],
        fontSize=8,
        leading=9,
        textColor=colors.HexColor('#2c3e50'),
        alignment=TA_LEFT
    )
    
    info_text = f"<b><font size=11>{company_name}</font></b><br/>"
    if config and config.ruc: info_text += f"RUC: {config.ruc}<br/>"
    else: info_text += f"RUC: 3431302-8<br/>"
    
    if config and config.direccion: info_text += f"{config.direccion}<br/>"
    if config and config.telefono: info_text += f"Tel: {config.telefono}<br/>"
    if config and config.email: info_text += f"Email: {config.email}"
    
    info_para = Paragraph(info_text, info_style)
    
    header_data = [[logo_img if logo_img else "", info_para]]
    header_table = Table(header_data, colWidths=[2*cm, 12*cm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    
    elements.append(header_table)
    
    # Title
    elements.append(Paragraph("REPORTE DE VENTAS", title_style))
    
    # Period
    if fecha_desde and fecha_hasta:
        period_text = f"Período: {fecha_desde.strftime('%d/%m/%Y')} al {fecha_hasta.strftime('%d/%m/%Y')}"
    else:
        period_text = "Período: Todas las ventas"
    elements.append(Paragraph(period_text, subtitle_style))
    
    # Generation date
    gen_date = f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    elements.append(Paragraph(gen_date, subtitle_style))
    
    elements.append(Spacer(1, 0.5*cm))
    
    # Calculate totals
    total_ventas = sum(d['venta'].total for d in ventas_data)
    total_costos = sum(d['costo_total'] for d in ventas_data)
    total_utilidad = sum(d['utilidad_bruta'] for d in ventas_data)
    margen_promedio = (total_utilidad / total_ventas * 100) if total_ventas > 0 else 0
    total_comisiones = total_comisiones_referidores + total_comisiones_bancarias
    utilidad_neta = total_utilidad - total_comisiones
    
    # Summary section
    elements.append(Paragraph("RESUMEN FINANCIERO", section_style))
    
    summary_data = [
        ['Métrica', 'Valor'],
        ['Total Ventas', f"{int(total_ventas):,}".replace(",", ".")],
        ['Total Costos', f"{int(total_costos):,}".replace(",", ".")],
        ['Utilidad Bruta', f"{int(total_utilidad):,}".replace(",", ".")],
        ['Total Comisiones', f"{int(total_comisiones):,}".replace(",", ".")],
        ['  - Referidores', f"{int(total_comisiones_referidores):,}".replace(",", ".")],
        ['  - Bancarias', f"{int(total_comisiones_bancarias):,}".replace(",", ".")],
        ['Utilidad Neta', f"{int(utilidad_neta):,}".replace(",", ".")],
        ['Margen Bruto Promedio', f"{margen_promedio:.2f}%"],
        ['Cantidad de Ventas', str(len(ventas_data))]
    ]
    
    summary_table = Table(summary_data, colWidths=[8*cm, 8*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#ecf0f1')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ('BACKGROUND', (0, 8), (-1, 8), colors.HexColor('#16a085')),
        ('TEXTCOLOR', (0, 8), (-1, 8), colors.whitesmoke),
        ('FONTNAME', (0, 8), (-1, 8), 'Helvetica-Bold'),
    ]))
    
    elements.append(summary_table)
    elements.append(Spacer(1, 1*cm))
    
    # Detail section
    elements.append(Paragraph("DETALLE DE VENTAS", section_style))
    
    table_data = [[
        'Fecha',
        'Factura',
        'Cliente',
        'Venta',
        'Costo',
        'Utilidad',
        'Margen',
        'Estado'
    ]]
    
    for data in ventas_data:
        venta = data['venta']
        costo_total = data['costo_total']
        utilidad_bruta = data['utilidad_bruta']
        margen_bruto = data['margen_bruto']
        
        cliente_nombre = venta.cliente_rel.nombre if venta.cliente_rel else "-"
        
        table_data.append([
            Paragraph(venta.fecha.strftime('%d/%m/%Y'), cell_style),
            Paragraph(venta.codigo, cell_style),
            Paragraph(cliente_nombre, cell_style),
            Paragraph(f"{int(venta.total):,}".replace(",", "."), cell_style),
            Paragraph(f"{int(costo_total):,}".replace(",", "."), cell_style),
            Paragraph(f"{int(utilidad_bruta):,}".replace(",", "."), cell_style),
            Paragraph(f"{margen_bruto:.1f}%", cell_style),
            Paragraph(venta.estado, cell_style)
        ])
    
    detail_table = Table(table_data, colWidths=[
        2*cm,   # Fecha
        2.2*cm, # Factura
        3.5*cm, # Cliente
        2.2*cm, # Venta
        2.2*cm, # Costo
        2.2*cm, # Utilidad
        1.8*cm, # Margen
        1.9*cm  # Estado
    ])
    
    detail_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('VALIGN', (0, 0), (-1, 0), 'MIDDLE'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 1), (2, -1), 'LEFT'),  
        ('ALIGN', (3, 1), (6, -1), 'RIGHT'), 
        ('ALIGN', (7, 1), (7, -1), 'CENTER'),
        ('VALIGN', (0, 1), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('LEFTPADDING', (0, 1), (-1, -1), 4),
        ('RIGHTPADDING', (0, 1), (-1, -1), 4),
    ]))
    
    elements.append(detail_table)
    
    # Footer
    elements.append(Spacer(1, 1*cm))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#95a5a6'),
        alignment=TA_CENTER
    )
    elements.append(Paragraph("HESAKA Web - Sistema de Gestión", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer
