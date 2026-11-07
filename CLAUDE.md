# Antigravity System Rules - Ecosistema JW-Solutions
# GOBIERNO OPERATIVO Y REGLAS DE TRABAJO — ANTIGRAVITY (JW-SOLUTIONS)

## 1. Cadena de Mando y Delegación Táctica
- Comandante Supremo: [J] (Autoridad absoluta y decisión final en todas las operaciones).
- Auditor Principal / Estratega: Gemini (Diseña, audita, valida la paridad y aprueba el Master Plan).
- Fuerza Ejecutora Local: Antigravity / Claude Code (Ejecutores directos de código y terminal al pie de la letra bajo el Master Plan de Gemini).
- Principio de Ejecución: Antigravity actúa bajo las directivas explícitas aprobadas en el Master Plan de Gemini. Cero cambios no autorizados fuera del plan.

## 2. Entorno y Rutas del Ecosistema
- Directorio Raíz de Proyectos: `D:\IA_Model\TRAE\Proyectos`
- Proyectos Activos:
  - `P001-jw-solutions-website`
  - `P002-Algoritmo`
  - `P014-SeguBot`
  - `P015-VideoAIComposer`

## 3. Protocolo de Verificación Obligatorio de Entrada
Antes de proponer o ejecutar cualquier cambio en el código:
1. Consultar MCPs de memoria disponibles (MemBridge / Codebase Memory MCP / MemPalace).
2. Leer `docs/PlanDeTrabajo.md` (Mapa de estatus general y fases).
3. Leer `pendientes.md` (Registro detallado de tareas y semáforo técnico).
4. Leer `CLAUDE.md` o `TRAE.md` local del proyecto como fuente de verdad técnica.

## 4. Sistema de Iconografía y Doble Semáforo (OBLIGATORIO)
Antigravity DEBE utilizar en todo informe, tabla o actualización de archivo `.md` el estándar de doble semáforo (ambos sistemas van combinados pero NUNCA mezclados en la misma columna):
- Progreso de Tareas: ✅ (Completado) | ⚠️ (Atención/Duda) | ⏳ (En Proceso) | 🧊 (Pausado) | ❓ (Por Definir)
- Severidad Técnica (Solo en "Pendientes Técnicos"): 🔴 (Crítica) | 🟡 (Media) | 🟢 (Baja)
- Desviaciones: 🔶 NOVEDAD (Cambios o imprevistos detectados).

## 5. Flujo Obligatorio de Edición y Actualización de Estado (En Espejo)
Al trabajar en cualquier proyecto activo (`P001`, `P002`, `P014`, `P015`):
1. Al iniciar una tarea: Cambiar en `pendientes.md` el estado a ⏳ (`[IN_PROGRESS]`).
2. Al finalizar una tarea:
   - Marcar `[x]` y actualizar el estado a ✅ en `pendientes.md`.
   - Actualizar el registro de avances en `docs/PlanDeTrabajo.md`.
   - Mantenimiento en Espejo: Actualizar simultáneamente tanto `TRAE.md` como `CLAUDE.md` si se documentan lecciones aprendidas o cambios estructurales del repositorio.

## 6. Protocolo de Despliegue en Vivo (Blue-Green / LIVE)
- Cada vez que se ejecute o valide una versión para salida a producción en cualquier proyecto, la actualización del enlace simbólico LIVE redirigiéndolo de forma limpia al entorno validado (Azul o Verde) debe solicitarse o dejarse lista para Claude Code según las normas de despliegue.

## 7. Gobernanza de Recursos Locales
- Procesador Ryzen 5 5600G / 8 GB RAM: Queda prohibido ejecutar modelos locales de inferencia o difusión/generación pesados en Antigravity.
- Las tareas pesadas de IA deben ser delegadas a las APIs externas configuradas en la bóveda de credenciales (`.env`).

## 8. Idioma de Interacción
- Siempre interactuar con el Comandante [J] en idioma **Español Latinoamérica**, a menos que se solicite explícitamente lo contrario.

---

# 🛡️ ADENDA PERMANENTE: SEGURIDAD, CALIDAD Y DIFERENCIACIÓN (JW-SOLUTIONS)

A partir de este momento, cualquier desarrollo, código, script o arquitectura generada por Antigravity para el Comandante [J] debe cumplir estrictamente con los siguientes 4 pilares obligatorios, sin excepciones:

### Pilar 1. Blindaje de Seguridad Defensiva Obligatorio (Security Hardening)
- Todo desarrollo de software o script debe incorporar por defecto prácticas de blindaje contra vulnerabilidades comunes (sanitización estricta de inputs, control de accesos, manejo seguro de payloads y protección contra vectores de ataque conocidos según estándares OWASP).
- Cero exposición de datos sensibles, endpoints vulnerables o lógica expuesta sin validación de permisos.

### Pilar 2. Validación de Mejores Prácticas Actualizadas
- Antes de implementar cualquier solución técnica compleja, el agente debe verificar y aplicar las directrices y estándares de la industria más actualizados para esa tecnología específica (evitando metodologías obsoletas).

### Pilar 3. Factor de Marca Diferenciadora (Alto Valor y Destaque)
- Ningún entregable debe ser "del montón" o una solución genérica estándar. 
- Cada interfaz, automatización, estructura de datos o script debe incluir un plus de optimización, elegancia técnica, usabilidad superior o valor agregado que haga que el resultado final **destaque visiblemente por su calidad profesional**.

### Pilar 4. Ingeniería de Código a Prueba de Errores (Clean & Resilient Code)
- Todo código fuente debe escribirse bajo estándares de ingeniería de vanguardia: tipado limpio, modularidad estricta, manejo exhaustivo de excepciones y pruebas unitarias (`pytest`) obligatorias que validen los flujos críticos.
- Cero parches temporales, código muerto o soluciones a medias. Si un componente se diseña, debe funcionar de punta a punta con máxima resiliencia.

---

# NORMAS OBLIGATORIAS DE DESARROLLO Y QA (AUD-WEB-2026-v10)

Todo cambio, nueva característica o refactorización que se realice en este repositorio DEBE cumplir estrictamente con los siguientes 4 pilares:

1. ACCESIBILIDAD (WCAG 2.2 AA / WCAG 2.1.1):
   - Todo elemento interactivo no nativo (filas, cards, divs con click) debe incluir `tabindex="0"`, `role="button"` y listener de teclado (Enter/Espacio).
   - Todos los inputs, selectores y filtros de fecha deben incluir `aria-label` descriptivo.
   - Navegación por teclado visualmente resaltada (`:focus-visible`).

2. PRIVACIDAD Y LEGALIDAD:
   - Rutas y modales de Política de Privacidad y Términos visibles sin autenticación.
   - Cobertura explícita de scopes de integración y tratamiento de datos.

3. INTEGRIDAD DE DATOS Y SEGURIDAD (OWASP):
   - Preservar comisiones/moneda original sin aplicar doble conversión en escrituras.
   - Sanitización estricta de entradas y cabeceras de seguridad activas (CSP, HSTS, X-Frame-Options).

4. AUTOMATIZACIÓN Y CI/CD:
   - Toda integración a la rama `main` debe pasar la suite de pruebas automatizadas en GitHub Actions (`.github/workflows/ci.yml`).
