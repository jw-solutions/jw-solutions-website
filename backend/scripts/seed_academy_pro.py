"""Seeder privado del backend para cargar niveles Pro (niveles 3-5, tier='pay') en PostgreSQL.

Nunca exponer este contenido en el repositorio estático público.
Genera contenido curricular Pro estructurado e idempotente en los 7 locales oficiales:
    es, en, pt-BR, pt-PT, fr, de, it.

Uso en VPS:
    python -m scripts.seed_academy_pro
"""
from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert

from app.core.database import session_scope
from app.models.academy import AcademyProLevel

LOCALES = ["es", "en", "pt-BR", "pt-PT", "fr", "de", "it"]
TECHS = ["python", "javascript", "typescript", "sql", "dax", "java", "csharp", "php", "json", "yaml"]

LEVEL_META_I18N: dict[int, dict[str, dict[str, str]]] = {
    3: {
        "es": {
            "title": "Refactorización modular (Pro)",
            "capsule": "Divide bloques monolíticos en unidades puras y composables con contratos explícitos y documentación lista para revisión.",
            "test_name": "Estructura modular y contrato explícito",
            "test_desc": "Aplica la abstracción modular y el estándar de documentación del lenguaje",
            "why": "Aísla responsabilidades en un dominio separado sin exponer la solución directa del reto.",
        },
        "en": {
            "title": "Modular Refactoring (Pro)",
            "capsule": "Split monolithic blocks into pure, composable units with explicit contracts and review-ready documentation.",
            "test_name": "Modular structure and explicit contract",
            "test_desc": "Applies modular abstraction and official language documentation",
            "why": "Isolates responsibilities in a separate domain without giving away the challenge solution.",
        },
        "pt-BR": {
            "title": "Refatoração modular (Pro)",
            "capsule": "Divida blocos monolíticos em unidades puras e componíveis com contratos explícitos e documentação pronta para revisão.",
            "test_name": "Estrutura modular e contrato explícito",
            "test_desc": "Aplica abstração modular e documentação oficial da linguagem",
            "why": "Isola responsabilidades em outro domínio sem entregar a solução direta do desafio.",
        },
        "pt-PT": {
            "title": "Refatoração modular (Pro)",
            "capsule": "Divida blocos monolíticos em unidades puras e componíveis com contratos explícitos e documentação pronta para revisão.",
            "test_name": "Estrutura modular e contrato explícito",
            "test_desc": "Aplica abstração modular e documentação oficial da linguagem",
            "why": "Isola responsabilidades num domínio diferente sem revelar a solução direta do desafio.",
        },
        "fr": {
            "title": "Refactorisation modulaire (Pro)",
            "capsule": "Découpez les blocs monolithiques en unités pures et composables dotées de contrats explicites et d'une documentation claire.",
            "test_name": "Structure modulaire et contrat explicite",
            "test_desc": "Applique l'abstraction modulaire et la documentation officielle du langage",
            "why": "Isole les responsabilités sur un domaine distinct sans révéler la solution directe.",
        },
        "de": {
            "title": "Modulares Refactoring (Pro)",
            "capsule": "Zerlege monolithische Blöcke in reine, wiederverwendbare Einheiten mit klaren Verträgen und prüfbarer Dokumentation.",
            "test_name": "Modulare Struktur und expliziter Vertrag",
            "test_desc": "Wendet modulare Abstraktion und offizielle Sprachdokumentation an",
            "why": "Trennt Verantwortlichkeiten in einer anderen Domäne, ohne die direkte Lösung vorwegzunehmen.",
        },
        "it": {
            "title": "Refactoring modulare (Pro)",
            "capsule": "Scomponi blocchi monolitici in unità pure e componibili con contratti espliciti e documentazione pronta per la revisione.",
            "test_name": "Struttura modulare e contratto esplicito",
            "test_desc": "Applica astrazione modulare e documentazione ufficiale del linguaggio",
            "why": "Isola le responsabilità su un dominio separato senza rivelare la soluzione diretta.",
        },
    },
    4: {
        "es": {
            "title": "Optimización y patrones avanzados (Pro)",
            "capsule": "Reduce complejidad ciclomática y lecturas redundantes protegiendo casos límite críticos en producción.",
            "test_name": "Patrón optimizado y guardia de casos borde",
            "test_desc": "Minimiza trabajo redundante y protege entradas nulas o vacías",
            "why": "Demuestra reducción de complejidad y guardias defensivas sobre un caso análogo.",
        },
        "en": {
            "title": "Optimization & Advanced Patterns (Pro)",
            "capsule": "Reduce cyclomatic complexity and redundant scans while guarding critical production edge cases.",
            "test_name": "Optimized pattern and edge-case guard",
            "test_desc": "Eliminates redundant work and guards null or empty inputs",
            "why": "Demonstrates complexity reduction and defensive guards on an analogous scenario.",
        },
        "pt-BR": {
            "title": "Otimização e padrões avançados (Pro)",
            "capsule": "Reduza complexidade ciclomática e leituras redundantes protegendo casos de borda críticos em produção.",
            "test_name": "Padrão otimizado e guarda de borda",
            "test_desc": "Elimina trabalho redundante e protege entradas nulas ou vazias",
            "why": "Demonstra redução de complexidade e guardas defensivas em um cenário análogo.",
        },
        "pt-PT": {
            "title": "Otimização e padrões avançados (Pro)",
            "capsule": "Reduza a complexidade ciclomática e leituras redundantes protegendo casos limite críticos em produção.",
            "test_name": "Padrão otimizado e guarda de casos limite",
            "test_desc": "Minimiza trabalho redundante e protege entradas nulas ou vazias",
            "why": "Demonstra redução de complexidade e guardas defensivas num cenário análogo.",
        },
        "fr": {
            "title": "Optimisation et modèles avancés (Pro)",
            "capsule": "Réduisez la complexité cyclomatique et les lectures redondantes tout en sécurisant les cas limites en production.",
            "test_name": "Modèle optimisé et garde de cas limite",
            "test_desc": "Supprime les calculs redondants et protège les entrées nulles ou vides",
            "why": "Illustre la réduction de complexité et les gardes défensives sur un cas analogue.",
        },
        "de": {
            "title": "Optimierung & fortgeschrittene Muster (Pro)",
            "capsule": "Senke zyklomatische Komplexität und redundante Auswertungen bei gleichzeitigem Schutz kritischer Grenzfälle.",
            "test_name": "Optimiertes Muster und Grenzfall-Guard",
            "test_desc": "Vermeidet Doppelarbeit und sichert leere oder null-Eingaben ab",
            "why": "Zeigt Komplexitätsreduktion und defensive Guards an einem analogen Beispiel.",
        },
        "it": {
            "title": "Ottimizzazione e pattern avanzati (Pro)",
            "capsule": "Riduci complessità ciclomatica e letture ridondanti proteggendo i casi limite critici in produzione.",
            "test_name": "Pattern ottimizzato e guardia casi limite",
            "test_desc": "Elimina lavoro ridondante e protegge input nulli o vuoti",
            "why": "Mostra riduzione della complessità e guardie difensive su un caso analogo.",
        },
    },
    5: {
        "es": {
            "title": "Auditoría y arquitectura limpia (Pro)",
            "capsule": "Entrega código auditable de punta a punta con validación defensiva estricta, tipado completo y documentación corporativa.",
            "test_name": "Contrato auditable listo para producción",
            "test_desc": "Cumple validación defensiva, formato oficial y trazabilidad completa",
            "why": "Muestra un bloque listo para auditoría técnica en un dominio independiente.",
        },
        "en": {
            "title": "Audit & Clean Architecture (Pro)",
            "capsule": "Deliver audit-ready production code with strict defensive validation, complete typing, and enterprise documentation.",
            "test_name": "Production audit-ready contract",
            "test_desc": "Meets defensive validation, official style, and full traceability",
            "why": "Shows an audit-ready block in an independent domain.",
        },
        "pt-BR": {
            "title": "Auditoria e arquitetura limpa (Pro)",
            "capsule": "Entregue código auditável de ponta a ponta com validação defensiva estrita, tipagem completa e documentação corporativa.",
            "test_name": "Contrato auditável pronto para produção",
            "test_desc": "Cumpre validação defensiva, estilo oficial e rastreabilidade completa",
            "why": "Exibe um bloco pronto para auditoria técnica em um domínio independente.",
        },
        "pt-PT": {
            "title": "Auditoria e arquitetura limpa (Pro)",
            "capsule": "Entregue código auditável de ponta a ponta com validação defensiva estrita, tipagem completa e documentação empresarial.",
            "test_name": "Contrato auditável pronto para produção",
            "test_desc": "Cumpre validação defensiva, norma oficial e rastreabilidade completa",
            "why": "Mostra um bloco pronto para auditoria técnica num domínio independente.",
        },
        "fr": {
            "title": "Audit et architecture propre (Pro)",
            "capsule": "Livrez un code auditable de bout en bout avec validation défensive stricte, typage complet et documentation d'entreprise.",
            "test_name": "Contrat auditable prêt pour la production",
            "test_desc": "Respecte la validation défensive, le style officiel et la traçabilité",
            "why": "Présente un bloc prêt pour audit technique dans un domaine indépendant.",
        },
        "de": {
            "title": "Audit & saubere Architektur (Pro)",
            "capsule": "Liefere prüfbaren Produktionscode mit strikter defensiver Validierung, vollständiger Typisierung und Enterprise-Dokumentation.",
            "test_name": "Prüfbarer Produktionsvertrag",
            "test_desc": "Erfüllt defensive Validierung, offiziellen Stil und volle Nachvollziehbarkeit",
            "why": "Zeigt einen prüfbaren Baustein in einer unabhängigen Domäne.",
        },
        "it": {
            "title": "Audit e architettura pulita (Pro)",
            "capsule": "Consegna codice verificabile end-to-end con validazione difensiva rigorosa, tipizzazione completa e documentazione enterprise.",
            "test_name": "Contratto verificabile pronto per la produzione",
            "test_desc": "Soddisfa validazione difensiva, stile ufficiale e piena tracciabilità",
            "why": "Mostra un blocco pronto per audit tecnico su un dominio indipendente.",
        },
    },
}

# Snippets reales por lenguaje (starter, reference, expected token, style_rules, analogous_code)
TECH_PRO_SPECS: dict[str, dict[str, object]] = {
    "sql": {
        "starter": "with t as (select user_id,sum(amount) s from invoices where status='paid' group by user_id) select * from t where s>100",
        "reference": "-- Monthly paid revenue per customer using explicit CTE\nWITH paid_totals AS (\n  SELECT\n    user_id,\n    SUM(amount) AS total_paid\n  FROM invoices\n  WHERE status = 'paid'\n  GROUP BY user_id\n)\nSELECT\n  user_id,\n  total_paid\nFROM paid_totals\nWHERE total_paid > 100;\n",
        "expected": "WITH ",
        "style_rules": ["uppercase_keywords", "multiline_select", "explicit_alias_as", "header_comment"],
        "analogous_code": "-- Active SKU totals grouped via CTE\nWITH sku_totals AS (\n  SELECT\n    sku,\n    SUM(qty) AS total_qty\n  FROM shipments\n  GROUP BY sku\n)\nSELECT\n  sku,\n  total_qty\nFROM sku_totals;\n",
    },
    "python": {
        "starter": "def summarize(rows):\n out={}\n for r in rows:\n  k=r.get('region')\n  out[k]=out.get(k,0)+r.get('amount',0)\n return out",
        "reference": "def summarize(rows: list[dict[str, object]]) -> dict[str, float]:\n    \"\"\"Aggregate positive amounts by normalized region key.\"\"\"\n    if not rows:\n        return {}\n    totals: dict[str, float] = {}\n    for row in rows:\n        region = str(row.get(\"region\") or \"unknown\").strip().lower()\n        totals[region] = round(totals.get(region, 0.0) + float(row.get(\"amount\", 0.0)), 2)\n    return totals\n",
        "expected": "-> dict[str, float]:",
        "style_rules": ["pep8_indent_4", "type_hints", "empty_guard", "docstring_pep257"],
        "analogous_code": "def count_by_status(events: list[dict[str, str]]) -> dict[str, int]:\n    \"\"\"Count normalized event statuses safely.\"\"\"\n    if not events:\n        return {}\n    counts: dict[str, int] = {}\n    for item in events:\n        key = item.get(\"status\", \"unknown\").strip().lower()\n        counts[key] = counts.get(key, 0) + 1\n    return counts\n",
    },
    "dax": {
        "starter": "YoY Growth:=([Sales]-[Sales LY])/[Sales LY]",
        "reference": "-- Year-over-year sales growth with safe zero-denominator fallback\nYoY Growth :=\nVAR _Current = [Sales]\nVAR _Previous = [Sales LY]\nRETURN\n    DIVIDE ( _Current - _Previous, _Previous, 0 )\n",
        "expected": "DIVIDE",
        "style_rules": ["var_return", "safe_divide", "header_comment"],
        "analogous_code": "-- Quarter-over-quarter ticket growth\nQoQ Tickets :=\nVAR _Now = [Tickets]\nVAR _Prev = [Tickets PQ]\nRETURN\n    DIVIDE ( _Now - _Prev, _Prev, 0 )\n",
    },
    "json": {
        "starter": "{'service':'api','limits':{'rpm':120,'burst':20,}}",
        "reference": "{\n  \"service\": \"api\",\n  \"limits\": {\n    \"rpm\": 120,\n    \"burst\": 20\n  }\n}\n",
        "expected": "\"limits\":",
        "style_rules": ["rfc8259_valid", "double_quotes", "indent_2", "no_trailing_comma"],
        "analogous_code": "{\n  \"worker\": \"mailer\",\n  \"retry\": {\n    \"maxAttempts\": 3,\n    \"backoffMs\": 500\n  }\n}\n",
    },
    "javascript": {
        "starter": "export function formatTotal(items){return items.reduce((a,b)=>a+b.price,0)}",
        "reference": "/**\n * Sums valid numeric prices from an order item list.\n * @param {Array<{price?: number}>} items\n * @returns {number}\n */\nexport function formatTotal(items) {\n  if (!Array.isArray(items)) return 0;\n  return items.reduce((acc, item) => acc + Number(item?.price ?? 0), 0);\n}\n",
        "expected": "@returns",
        "style_rules": ["jsdoc", "optional_chaining", "nullish_coalescing", "semicolons"],
        "analogous_code": "/**\n * Counts active seats across team records.\n * @param {Array<{seats?: number}>} teams\n * @returns {number}\n */\nexport function countSeats(teams) {\n  return (teams ?? []).reduce((sum, t) => sum + Number(t?.seats ?? 0), 0);\n}\n",
    },
    "typescript": {
        "starter": "export function pickEmail(u: any){return u.email}",
        "reference": "/**\n * Extracts a normalized email from an unknown payload.\n * @param input - Untrusted input object.\n * @returns Validated email string or null.\n */\nexport function pickEmail(input: unknown): string | null {\n  if (typeof input !== 'object' || input === null) return null;\n  const email = (input as Record<string, unknown>).email;\n  return typeof email === 'string' ? email.trim().toLowerCase() : null;\n}\n",
        "expected": "input: unknown",
        "style_rules": ["no_explicit_any", "tsdoc", "return_type"],
        "analogous_code": "/**\n * Extracts a non-empty SKU string from unknown data.\n */\nexport function pickSku(raw: unknown): string | null {\n  if (typeof raw !== 'object' || raw === null) return null;\n  const sku = (raw as Record<string, unknown>).sku;\n  return typeof sku === 'string' && sku.trim() ? sku.trim() : null;\n}\n",
    },
    "java": {
        "starter": "public class Invoice{public final String id;public Invoice(String id){this.id=id;}}",
        "reference": "import java.util.Objects;\n\n/**\n * Immutable invoice identifier carrier.\n * @param id Non-null invoice identifier.\n */\npublic record Invoice(String id) {\n    public Invoice {\n        Objects.requireNonNull(id, \"id must not be null\");\n    }\n}\n",
        "expected": "record Invoice",
        "style_rules": ["java_record", "null_guard", "javadoc"],
        "analogous_code": "import java.util.Objects;\n\n/**\n * Immutable shipment tracking record.\n * @param code Non-null tracking code.\n */\npublic record TrackingCode(String code) {\n    public TrackingCode {\n        Objects.requireNonNull(code, \"code must not be null\");\n    }\n}\n",
    },
    "csharp": {
        "starter": "public class OrderRepo{private readonly object _db;public OrderRepo(object db){_db=db;}}",
        "reference": "/// <summary>\n/// Persists validated order aggregates.\n/// </summary>\n/// <param name=\"db\">Database connection dependency.</param>\npublic sealed class OrderRepo(object db)\n{\n    private readonly object _db = db ?? throw new ArgumentNullException(nameof(db));\n}\n",
        "expected": "ArgumentNullException",
        "style_rules": ["primary_constructor", "xml_docs", "null_guard", "allman_braces"],
        "analogous_code": "/// <summary>\n/// Handles audit event dispatch.\n/// </summary>\npublic sealed class AuditSink(object writer)\n{\n    private readonly object _writer = writer ?? throw new ArgumentNullException(nameof(writer));\n}\n",
    },
    "php": {
        "starter": "<?php\nclass Status{public $v;function __construct($v){$this->v=$v;}}",
        "reference": "<?php\n\ndeclare(strict_types=1);\n\nenum OrderStatus: string\n{\n    case Paid = 'paid';\n    case Pending = 'pending';\n}\n\nfinal class OrderSummary\n{\n    public function __construct(\n        public readonly OrderStatus $status,\n    )\n    {\n    }\n}\n",
        "expected": "declare(strict_types=1);",
        "style_rules": ["strict_types", "php83_enum", "readonly_property", "psr12_braces"],
        "analogous_code": "<?php\n\ndeclare(strict_types=1);\n\nenum TicketState: string\n{\n    case Open = 'open';\n    case Closed = 'closed';\n}\n",
    },
    "yaml": {
        "starter": "jobs:\n\tbuild:\n\t\tsteps: [checkout, test]",
        "reference": "# Production CI validation pipeline\njobs:\n  build:\n    steps:\n      - checkout\n      - test\n",
        "expected": "- checkout",
        "style_rules": ["no_tabs", "indent_2", "list_dashes", "header_comment"],
        "analogous_code": "# Nightly backup workflow\njobs:\n  backup:\n    steps:\n      - dump\n      - verify\n",
    },
}


def build_pro_level_records() -> list[dict]:
    """Construye los 210 registros Pro estructurados (10 techs × 3 niveles × 7 locales)."""
    records: list[dict] = []
    for tech in TECHS:
        spec = TECH_PRO_SPECS[tech]
        for lvl_num in (3, 4, 5):
            for loc in LOCALES:
                meta = LEVEL_META_I18N[lvl_num][loc]
                title = f"{tech.upper()} {lvl_num} · {meta['title']}"
                payload = {
                    "id": f"{tech}-{lvl_num}",
                    "tier": "pay",
                    "concept_capsule": meta["capsule"],
                    "starter_code": spec["starter"],
                    "reference_solution": spec["reference"],
                    "style_rules": list(spec["style_rules"]),
                    "tests": [
                        {
                            "id": f"{tech}{lvl_num}-t1",
                            "name": meta["test_name"],
                            "visible": True,
                            "type": "pattern",
                            "expected": spec["expected"],
                            "description": meta["test_desc"],
                        },
                    ],
                    "analogous_example": {
                        "title": title,
                        "code": spec["analogous_code"],
                        "why_it_works": meta["why"],
                    },
                }
                records.append(
                    {
                        "tech": tech,
                        "level": lvl_num,
                        "locale": loc,
                        "title": title,
                        "payload": payload,
                    }
                )
    return records


def seed_pro_levels() -> int:
    records = build_pro_level_records()
    with session_scope() as db:
        for rec in records:
            stmt = (
                insert(AcademyProLevel)
                .values(**rec)
                .on_conflict_do_update(
                    constraint="uq_academy_pro_levels_tech_lvl_loc",
                    set_={"title": rec["title"], "payload": rec["payload"]},
                )
            )
            db.execute(stmt)
    return len(records)


if __name__ == "__main__":
    total = seed_pro_levels()
    print(f"Seeded {total} Pro academy levels across {len(LOCALES)} locales.")
