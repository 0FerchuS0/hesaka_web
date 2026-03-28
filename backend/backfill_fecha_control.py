from __future__ import annotations

import argparse
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime

from app.database import get_session_for_tenant
from app.models.clinica_models import ConsultaContactologia, ConsultaOftalmologica


@dataclass
class ConsultaPreview:
    consulta_tipo: str
    consulta_id: int
    paciente_id: int
    paciente_nombre: str
    fecha_consulta: datetime
    nueva_fecha_control: date


def sumar_un_ano(fecha_base: date) -> date:
    try:
        return fecha_base.replace(year=fecha_base.year + 1)
    except ValueError:
        # 29/02 -> 28/02 del año siguiente
        return fecha_base.replace(month=2, day=28, year=fecha_base.year + 1)


def obtener_candidatas(
    session,
    model,
    consulta_tipo: str,
    *,
    today: date,
    mode: str,
) -> list[ConsultaPreview]:
    query = (
        session.query(model)
        .filter(model.fecha < datetime.combine(today, datetime.min.time()))
        .order_by(model.paciente_id.asc(), model.fecha.desc(), model.id.desc())
    )

    previews: list[ConsultaPreview] = []
    pacientes_vistos: set[int] = set()

    for consulta in query.all():
        if consulta.paciente_id in pacientes_vistos:
            continue
        pacientes_vistos.add(consulta.paciente_id)
        if mode == "latest" and consulta.fecha_control is not None:
            continue
        if mode == "all" and consulta.fecha_control is not None:
            continue
        fecha_consulta = consulta.fecha
        previews.append(
            ConsultaPreview(
                consulta_tipo=consulta_tipo,
                consulta_id=consulta.id,
                paciente_id=consulta.paciente_id,
                paciente_nombre=(consulta.paciente_rel.nombre_completo if consulta.paciente_rel else f"Paciente {consulta.paciente_id}"),
                fecha_consulta=fecha_consulta,
                nueva_fecha_control=sumar_un_ano(fecha_consulta.date()),
            )
        )

    return previews


def imprimir_resumen(previews: Iterable[ConsultaPreview], *, limit: int) -> None:
    previews = list(previews)
    print("=" * 80)
    print(f"Consultas candidatas: {len(previews)}")
    print("=" * 80)
    for preview in previews[:limit]:
        print(
            f"[{preview.consulta_tipo}] consulta={preview.consulta_id} "
            f"paciente={preview.paciente_id} {preview.paciente_nombre} | "
            f"fecha={preview.fecha_consulta:%d/%m/%Y} -> control={preview.nueva_fecha_control:%d/%m/%Y}"
        )
    if len(previews) > limit:
        print(f"... y {len(previews) - limit} más")


def aplicar(session, previews: Iterable[ConsultaPreview]) -> int:
    total = 0
    for preview in previews:
        if preview.consulta_tipo == "OFTALMOLOGIA":
            consulta = session.get(ConsultaOftalmologica, preview.consulta_id)
        else:
            consulta = session.get(ConsultaContactologia, preview.consulta_id)
        if consulta is None or consulta.fecha_control is not None:
            continue
        consulta.fecha_control = preview.nueva_fecha_control
        total += 1
    session.commit()
    return total


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Completa fecha_control histórica en consultas clínicas anteriores a hoy."
    )
    parser.add_argument("--tenant", default="demo", help="Tenant slug. Default: demo")
    parser.add_argument(
        "--mode",
        choices=["latest", "all"],
        default="latest",
        help="latest = solo la última consulta vacía por paciente y tipo; all = todas las vacías",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Aplica los cambios. Si no se pasa, corre solo en vista previa.",
    )
    parser.add_argument(
        "--preview-limit",
        type=int,
        default=20,
        help="Cantidad máxima de ejemplos a mostrar en la vista previa.",
    )
    args = parser.parse_args()

    today = date.today()
    session = get_session_for_tenant(args.tenant)

    try:
        oft = obtener_candidatas(
            session,
            ConsultaOftalmologica,
            "OFTALMOLOGIA",
            today=today,
            mode=args.mode,
        )
        cont = obtener_candidatas(
            session,
            ConsultaContactologia,
            "CONTACTOLOGIA",
            today=today,
            mode=args.mode,
        )
        previews = sorted(
            [*oft, *cont],
            key=lambda item: (item.consulta_tipo, item.paciente_nombre.lower(), item.fecha_consulta),
        )

        print(f"Tenant: {args.tenant}")
        print(f"Modo : {args.mode}")
        print(f"Hoy  : {today:%d/%m/%Y}")
        imprimir_resumen(previews, limit=args.preview_limit)

        if not args.apply:
            print("\nVista previa completada. Usa --apply para guardar los cambios.")
            return

        total = aplicar(session, previews)
        print(f"\nCambios aplicados correctamente: {total}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
