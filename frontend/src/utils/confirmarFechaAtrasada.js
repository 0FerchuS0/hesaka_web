/**
 * Antes de guardar un gasto/cobro/pago con una fecha de un dia anterior a hoy,
 * pide confirmacion (el backend igual acepta fechas pasadas — ver
 * require_jornada_abierta_para_fecha — esto es solo un "¿seguro?" para evitar
 * cargar algo con la fecha equivocada por error).
 *
 * `valorFecha` es el value de un input date o datetime-local (string "YYYY-MM-DD...").
 * Devuelve true si se puede continuar con el guardado.
 */
export function confirmarFechaAtrasada(valorFecha) {
    if (!valorFecha) return true
    const soloFecha = String(valorFecha).slice(0, 10)
    const hoy = new Date()
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    if (soloFecha >= hoyStr) return true
    const [anio, mes, dia] = soloFecha.split('-')
    return window.confirm(
        `Estás cargando esto con fecha del ${dia}/${mes}/${anio}, un día ya cerrado. ¿Confirmás?`
    )
}
