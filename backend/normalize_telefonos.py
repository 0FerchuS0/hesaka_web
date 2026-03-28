from __future__ import annotations

import argparse
import re
from collections.abc import Iterable
from dataclasses import dataclass

from app.database import get_session_for_tenant
from app.models.clinica_models import Paciente
from app.models.models import Cliente


TELEFONO_PATTERN = re.compile(r"[^\d+]")


@dataclass
class TelefonoPreview:
    tabla: str
    record_id: int
    nombre: str
    telefono_original: str
    telefono_nuevo: str


def normalizar_telefono_paraguay(valor: str | None) -> str | None:
    if not valor:
        return None

    limpio = TELEFONO_PATTERN.sub("", valor.strip())
    if not limpio:
        return None

    if limpio.startswith("+595"):
        digits = "+" + re.sub(r"\D", "", limpio)
        return digits

    digits = re.sub(r"\D", "", limpio)

    if digits.startswith("5959") and len(digits) == 12:
        return f"+{digits}"

    if digits.startswith("09") and len(digits) == 10:
        return f"+595{digits[1:]}"

    if digits.startswith("9") and len(digits) == 9:
        return f"+595{digits}"

    return None


def obtener_candidatos(session, model, tabla: str) -> list[TelefonoPreview]:
    previews: list[TelefonoPreview] = []
    for record in session.query(model).filter(model.telefono.is_not(None)).all():
        telefono_original = (record.telefono or "").strip()
        telefono_nuevo = normalizar_telefono_paraguay(telefono_original)
        if not telefono_nuevo or telefono_nuevo == telefono_original:
            continue
        previews.append(
            TelefonoPreview(
                tabla=tabla,
                record_id=record.id,
                nombre=getattr(record, "nombre", None) or getattr(record, "nombre_completo", f"ID {record.id}"),
                telefono_original=telefono_original,
                telefono_nuevo=telefono_nuevo,
            )
        )
    return previews


def imprimir_resumen(previews: Iterable[TelefonoPreview], *, limit: int) -> None:
    previews = list(previews)
    print("=" * 80)
    print(f"Teléfonos candidatos: {len(previews)}")
    print("=" * 80)
    for preview in previews[:limit]:
        print(
            f"[{preview.tabla}] id={preview.record_id} {preview.nombre} | "
            f"{preview.telefono_original} -> {preview.telefono_nuevo}"
        )
    if len(previews) > limit:
        print(f"... y {len(previews) - limit} más")


def aplicar(session, previews: Iterable[TelefonoPreview]) -> int:
    total = 0
    for preview in previews:
        if preview.tabla == "clientes":
            record = session.get(Cliente, preview.record_id)
        else:
            record = session.get(Paciente, preview.record_id)
        if record is None:
            continue
        record.telefono = preview.telefono_nuevo
        total += 1
    session.commit()
    return total


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Normaliza teléfonos paraguayos al formato +5959... en clientes y pacientes."
    )
    parser.add_argument("--tenant", default="demo", help="Tenant slug. Default: demo")
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

    session = get_session_for_tenant(args.tenant)
    try:
        previews = sorted(
            [
                *obtener_candidatos(session, Cliente, "clientes"),
                *obtener_candidatos(session, Paciente, "pacientes"),
            ],
            key=lambda item: (item.tabla, item.nombre.lower()),
        )
        print(f"Tenant: {args.tenant}")
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
