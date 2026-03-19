import io
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side


def generar_excel_reporte_finanzas(
    resumen,
    config,
    fecha_desde=None,
    fecha_hasta=None,
):
    wb = Workbook()
    ws = wb.active
    ws.title = "Reporte Financiero"

    font_title = Font(name="Arial", size=16, bold=True, color="2C3E50")
    font_subtitle = Font(name="Arial", size=11, italic=True)
    font_header = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    font_bold = Font(name="Arial", size=10, bold=True)
    fill_header = PatternFill(start_color="3498DB", end_color="3498DB", fill_type="solid")
    fill_success = PatternFill(start_color="2ECC71", end_color="2ECC71", fill_type="solid")
    border = Border(
        left=Side(style="thin", color="BDC3C7"),
        right=Side(style="thin", color="BDC3C7"),
        top=Side(style="thin", color="BDC3C7"),
        bottom=Side(style="thin", color="BDC3C7"),
    )
    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    company_name = config.nombre if (config and config.nombre) else "HESAKA"
    ws.merge_cells("A1:H1")
    ws["A1"] = company_name
    ws["A1"].font = font_title
    ws["A1"].alignment = align_center

    ws.merge_cells("A2:H2")
    ws["A2"] = "REPORTE FINANCIERO"
    ws["A2"].font = Font(name="Arial", size=14, bold=True, color="34495E")
    ws["A2"].alignment = align_center

    if fecha_desde and fecha_hasta:
        period_text = f"Periodo: {fecha_desde.strftime('%d/%m/%Y')} al {fecha_hasta.strftime('%d/%m/%Y')}"
    else:
        period_text = "Periodo: Movimientos financieros"
    ws.merge_cells("A3:H3")
    ws["A3"] = period_text
    ws["A3"].font = font_subtitle
    ws["A3"].alignment = align_center

    ws.merge_cells("A4:H4")
    ws["A4"] = f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    ws["A4"].alignment = align_right

    row_idx = 6
    ws.merge_cells(f"A{row_idx}:B{row_idx}")
    ws[f"A{row_idx}"] = "RESUMEN"
    ws[f"A{row_idx}"].font = Font(name="Arial", size=12, bold=True, color="3498DB")
    row_idx += 1

    resumen_data = [
        ("Metrica", "Valor"),
        ("Total Ingresos", resumen.total_ingresos),
        ("Total Egresos", resumen.total_egresos),
        ("Resultado Neto", resumen.resultado_neto),
        ("Margen", f"{resumen.margen:.2f}%"),
        ("Ingresos Caja", resumen.ingresos_caja),
        ("Ingresos Banco", resumen.ingresos_banco),
        ("Egresos Caja", resumen.egresos_caja),
        ("Egresos Banco", resumen.egresos_banco),
        ("Saldo Actual Caja", resumen.saldo_actual_caja),
        ("Saldo Actual Bancos", resumen.saldo_actual_bancos),
        ("Saldo Final Total", resumen.saldo_final_total),
        ("Cantidad Movimientos", len(resumen.todos)),
    ]

    for i, (label, value) in enumerate(resumen_data):
        ws[f"A{row_idx}"] = label
        ws[f"B{row_idx}"] = value
        ws[f"A{row_idx}"].border = border
        ws[f"B{row_idx}"].border = border
        if i == 0:
            ws[f"A{row_idx}"].fill = fill_header
            ws[f"B{row_idx}"].fill = fill_header
            ws[f"A{row_idx}"].font = font_header
            ws[f"B{row_idx}"].font = font_header
            ws[f"A{row_idx}"].alignment = align_center
            ws[f"B{row_idx}"].alignment = align_center
        else:
            ws[f"A{row_idx}"].font = font_bold
            ws[f"B{row_idx}"].alignment = align_right
            if i in [1, 2, 3, 5, 6, 7, 8, 9, 10, 11]:
                ws[f"B{row_idx}"].number_format = "#,##0"
            if i == 3:
                ws[f"A{row_idx}"].fill = fill_success
                ws[f"B{row_idx}"].fill = fill_success
                ws[f"A{row_idx}"].font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
                ws[f"B{row_idx}"].font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
        row_idx += 1

    row_idx += 2
    ws.merge_cells(f"A{row_idx}:H{row_idx}")
    ws[f"A{row_idx}"] = "DETALLE DE MOVIMIENTOS"
    ws[f"A{row_idx}"].font = Font(name="Arial", size=12, bold=True, color="3498DB")
    row_idx += 1

    headers = ["Fecha", "Origen", "Banco", "Categoria", "Tipo", "Concepto", "Referencia", "Monto"]
    for idx, header in enumerate(headers, 1):
        cell = ws.cell(row=row_idx, column=idx)
        cell.value = header
        cell.font = font_header
        cell.fill = fill_header
        cell.border = border
        cell.alignment = align_center
    row_idx += 1

    for mov in resumen.todos:
        row_data = [
            mov.fecha.strftime("%d/%m/%Y %H:%M"),
            mov.origen,
            mov.banco_nombre or "-",
            mov.categoria or "-",
            mov.tipo,
            mov.concepto or "-",
            mov.referencia or "-",
            mov.monto,
        ]
        for idx, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=idx)
            cell.value = value
            cell.border = border
            if idx == 8:
                cell.number_format = "#,##0"
                cell.alignment = align_right
            elif idx in [1, 2, 3, 4, 5]:
                cell.alignment = align_center
            else:
                cell.alignment = align_left
        row_idx += 1

    widths = {"A": 18, "B": 12, "C": 18, "D": 18, "E": 14, "F": 34, "G": 18, "H": 14}
    for col, width in widths.items():
        ws.column_dimensions[col].width = width

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
