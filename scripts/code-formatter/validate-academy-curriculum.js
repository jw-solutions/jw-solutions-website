#!/usr/bin/env node
/**
 * Validador CI estático y funcional para el currículo de Code Formatter Academy.
 * - Verifica paridad de claves e IDs en los 7 locales (es, en, pt-BR, pt-PT, fr, de, it).
 * - Comprueba ausencia de campos vacíos.
 * - Guardia de Seguridad (Propiedad Intelectual): falla con exit code 1 si detecta
 *   campos privados (solution, reference_solution, starter_code, tests, remedial_drills,
 *   concept_capsule, style_rules) en nodos tier: "pay" dentro del repo público.
 * - Ejecuta las pruebas unitarias de todas las reference_solution tier: "free".
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(process.cwd());
const ACADEMY_DIR = join(ROOT, 'content', 'code-formatter-academy');
const LOCALES = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];
const TECHS = ['python', 'javascript', 'typescript', 'sql', 'dax', 'java', 'csharp', 'php', 'json', 'yaml'];
const FORBIDDEN_PAY_FIELDS = [
  'solution',
  'reference_solution',
  'starter_code',
  'tests',
  'remedial_drills',
  'concept_capsule',
  'style_rules',
  'hint',
];

const errors = [];

function assertNonEmpty(val, ctx) {
  if (val === null || val === undefined) {
    errors.push(`${ctx}: valor nulo o indefinido`);
    return false;
  }
  if (typeof val === 'string' && !val.trim()) {
    errors.push(`${ctx}: cadena vacía`);
    return false;
  }
  if (Array.isArray(val) && val.length === 0) {
    errors.push(`${ctx}: arreglo vacío`);
    return false;
  }
  return true;
}

function readJson(filePath) {
  if (!existsSync(filePath)) {
    errors.push(`Archivo faltante: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    errors.push(`JSON inválido en ${filePath}: ${err.message}`);
    return null;
  }
}

function runTestCase(solution, test, ctx) {
  if (test.type === 'pattern') {
    if (!solution.includes(test.expected)) {
      errors.push(`${ctx} [${test.id}]: falta patrón esperado "${test.expected}"`);
    }
  } else if (test.type === 'pattern_absent') {
    if (solution.includes(test.expected)) {
      errors.push(`${ctx} [${test.id}]: contiene patrón prohibido "${test.expected}"`);
    }
  } else if (test.type === 'json_valid') {
    try {
      JSON.parse(solution);
    } catch (err) {
      errors.push(`${ctx} [${test.id}]: JSON inválido (${err.message})`);
    }
  } else if (test.type === 'eval') {
    try {
      const cleaned = solution.replace(/^\s*export\s+/gm, '');
      const sandbox = {};
      vm.createContext(sandbox);
      vm.runInContext(`${cleaned}\nthis.__result = (${test.input});`, sandbox, { timeout: 1000 });
      if (sandbox.__result !== test.expected) {
        errors.push(`${ctx} [${test.id}]: esperado ${JSON.stringify(test.expected)}, obtenido ${JSON.stringify(sandbox.__result)}`);
      }
    } catch (err) {
      errors.push(`${ctx} [${test.id}]: error al evaluar (${err.message})`);
    }
  }
}

// 1. Validar paths.json
const pathsDoc = readJson(join(ACADEMY_DIR, 'paths.json'));
if (pathsDoc) {
  assertNonEmpty(pathsDoc.paths, 'paths.json.paths');
  for (const p of pathsDoc.paths || []) {
    assertNonEmpty(p.id, 'paths.json.id');
    assertNonEmpty(p.technologies, `paths.json[${p.id}].technologies`);
    for (const loc of LOCALES) {
      const i18n = p.i18n?.[loc];
      if (!i18n) {
        errors.push(`paths.json[${p.id}]: falta locale ${loc}`);
        continue;
      }
      assertNonEmpty(i18n.title, `paths.json[${p.id}].${loc}.title`);
      assertNonEmpty(i18n.tagline, `paths.json[${p.id}].${loc}.tagline`);
      assertNonEmpty(i18n.industryUse, `paths.json[${p.id}].${loc}.industryUse`);
      assertNonEmpty(i18n.problemsSolved, `paths.json[${p.id}].${loc}.problemsSolved`);
      assertNonEmpty(i18n.targetRoles, `paths.json[${p.id}].${loc}.targetRoles`);
    }
  }
}

// 2. Validar achievements.json
const achDoc = readJson(join(ACADEMY_DIR, 'achievements.json'));
if (achDoc) {
  assertNonEmpty(achDoc.achievements, 'achievements.json.achievements');
  for (const a of achDoc.achievements || []) {
    assertNonEmpty(a.id, 'achievements.json.id');
    for (const loc of LOCALES) {
      const i18n = a.i18n?.[loc];
      if (!i18n) {
        errors.push(`achievements.json[${a.id}]: falta locale ${loc}`);
        continue;
      }
      assertNonEmpty(i18n.title, `achievements.json[${a.id}].${loc}.title`);
      assertNonEmpty(i18n.description, `achievements.json[${a.id}].${loc}.description`);
    }
  }
}

// 3. Validar daily-challenges.json
const dailyDoc = readJson(join(ACADEMY_DIR, 'daily-challenges.json'));
if (dailyDoc) {
  assertNonEmpty(dailyDoc.challenges, 'daily-challenges.json.challenges');
  for (const ch of dailyDoc.challenges || []) {
    const ctx = `daily-challenges.json[${ch.id}]`;
    if (ch.tier === 'pay') {
      errors.push(`${ctx}: los retos diarios públicos no pueden ser tier "pay"`);
    }
    assertNonEmpty(ch.starter_code, `${ctx}.starter_code`);
    assertNonEmpty(ch.reference_solution, `${ctx}.reference_solution`);
    assertNonEmpty(ch.tests, `${ctx}.tests`);
    for (const t of ch.tests || []) {
      runTestCase(ch.reference_solution, t, ctx);
    }
    for (const loc of LOCALES) {
      const i18n = ch.i18n?.[loc];
      if (!i18n) {
        errors.push(`${ctx}: falta locale ${loc}`);
        continue;
      }
      assertNonEmpty(i18n.title, `${ctx}.${loc}.title`);
      assertNonEmpty(i18n.prompt, `${ctx}.${loc}.prompt`);
      assertNonEmpty(i18n.hint, `${ctx}.${loc}.hint`);
    }
  }
}

// 4. Validar 70 archivos de currículo + paridad + guardia de seguridad Pay
for (const tech of TECHS) {
  let baselineIds = null;
  for (const loc of LOCALES) {
    const file = join(ACADEMY_DIR, 'curriculum', loc, `${tech}.json`);
    const doc = readJson(file);
    if (!doc) continue;

    const ctx = `curriculum/${loc}/${tech}.json`;
    assertNonEmpty(doc.standard, `${ctx}.standard`);
    assertNonEmpty(doc.levels, `${ctx}.levels`);

    const ids = (doc.levels || []).map((l) => `${l.id}:${l.tier}:${l.level}`);
    if (!baselineIds) {
      baselineIds = ids;
    } else if (JSON.stringify(ids) !== JSON.stringify(baselineIds)) {
      errors.push(`${ctx}: paridad de niveles/IDs/tiers distinta respecto a ${LOCALES[0]}`);
    }

    for (const lvl of doc.levels || []) {
      const lctx = `${ctx}#${lvl.id}`;
      assertNonEmpty(lvl.id, `${lctx}.id`);
      assertNonEmpty(lvl.title, `${lctx}.title`);

      if (lvl.tier === 'pay') {
        // GUARDIA DE SEGURIDAD: cero campos privados en niveles pay dentro del repo público
        for (const forbidden of FORBIDDEN_PAY_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(lvl, forbidden)) {
            errors.push(`SECURITY_VIOLATION ${lctx}: campo privado "${forbidden}" expuesto en nodo tier "pay"`);
          }
        }
      } else if (lvl.tier === 'free') {
        assertNonEmpty(lvl.concept_capsule, `${lctx}.concept_capsule`);
        assertNonEmpty(lvl.starter_code, `${lctx}.starter_code`);
        assertNonEmpty(lvl.reference_solution, `${lctx}.reference_solution`);
        assertNonEmpty(lvl.style_rules, `${lctx}.style_rules`);
        assertNonEmpty(lvl.tests, `${lctx}.tests`);
        assertNonEmpty(lvl.remedial_drills, `${lctx}.remedial_drills`);

        for (const t of lvl.tests || []) {
          runTestCase(lvl.reference_solution, t, lctx);
        }
        for (const d of lvl.remedial_drills || []) {
          assertNonEmpty(d.id, `${lctx}.drill.id`);
          assertNonEmpty(d.error_type, `${lctx}.drill.error_type`);
          assertNonEmpty(d.title, `${lctx}.drill.title`);
          assertNonEmpty(d.prompt, `${lctx}.drill.prompt`);
          assertNonEmpty(d.starter_code, `${lctx}.drill.starter_code`);
          assertNonEmpty(d.expected_pattern, `${lctx}.drill.expected_pattern`);
          assertNonEmpty(d.solution_hint, `${lctx}.drill.solution_hint`);
        }
      } else {
        errors.push(`${lctx}: tier inválido "${lvl.tier}"`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`❌ Validación fallida (${errors.length} errores):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`OK Academia validada: ${LOCALES.length} idiomas × ${TECHS.length} tecnologías, 0 fugas tier "pay", todas las reference_solution aprobadas.`);
