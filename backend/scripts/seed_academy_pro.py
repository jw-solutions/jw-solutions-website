"""Seeder privado del backend para cargar niveles Pro (niveles 3-5, tier='pay') en PostgreSQL.

Nunca exponer este contenido en el repositorio estático público.
Uso en VPS:
    python -m scripts.seed_academy_pro
"""
from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert

from app.core.database import session_scope
from app.models.academy import AcademyProLevel

TECHS = ["python", "javascript", "typescript", "sql", "dax", "java", "csharp", "php", "json", "yaml"]

PRO_TEMPLATES = {
    3: {
        "title_es": "Refactorización modular (Pro)",
        "concept_capsule": "Descompón funciones monolíticas en unidades puras testables con contratos explícitos.",
        "style_rules": ["modular_functions", "official_docs"],
    },
    4: {
        "title_es": "Optimización y patrones avanzados (Pro)",
        "concept_capsule": "Reduce complejidad ciclomática y asignaciones innecesarias manteniendo legibilidad.",
        "style_rules": ["low_complexity", "edge_case_guards"],
    },
    5: {
        "title_es": "Auditoría y arquitectura limpia (Pro)",
        "concept_capsule": "Aplica validación defensiva estricta, tipado completo y documentación lista para auditoría.",
        "style_rules": ["strict_typing", "audit_ready_docs"],
    },
}


def seed_pro_levels() -> int:
    inserted = 0
    with session_scope() as db:
        for tech in TECHS:
            for lvl_num, tpl in PRO_TEMPLATES.items():
                payload = {
                    "id": f"{tech}-{lvl_num}",
                    "tier": "pay",
                    "concept_capsule": tpl["concept_capsule"],
                    "starter_code": f"// {tech.upper()} Pro Level {lvl_num} starter",
                    "reference_solution": f"// {tech.upper()} Pro Level {lvl_num} clean solution",
                    "style_rules": tpl["style_rules"],
                    "tests": [
                        {"id": f"{tech}{lvl_num}-t1", "name": "Clean architecture", "visible": True, "type": "pattern", "expected": "Pro"},
                    ],
                }
                stmt = (
                    insert(AcademyProLevel)
                    .values(
                        tech=tech,
                        level=lvl_num,
                        locale="es",
                        title=f"{tech.upper()} {lvl_num} · {tpl['title_es']}",
                        payload=payload,
                    )
                    .on_conflict_do_update(
                        constraint="uq_academy_pro_levels_tech_lvl_loc",
                        set_={"title": f"{tech.upper()} {lvl_num} · {tpl['title_es']}", "payload": payload},
                    )
                )
                db.execute(stmt)
                inserted += 1
    return inserted


if __name__ == "__main__":
    total = seed_pro_levels()
    print(f"Seeded {total} Pro academy levels.")
