#!/usr/bin/env node
/**
 * Enumera las copropiedades activas del proyecto, con su identificador.
 *
 * Existe porque el paso previo a cualquier aprovisionamiento es «pásale el UUID
 * de la copropiedad» y hasta ahora la única forma de saberlo era provocar un
 * error a propósito: `aprovisionar-rol.mjs` con un UUID inventado, para que al
 * fallar imprimiera la lista. Funciona y es una forma pésima de documentar un
 * paso obligatorio.
 *
 * LO QUE NO HACE: no lee ningún secreto del repositorio ni imprime credencial
 * alguna. Solo nombre, NIT e identificador, que es lo que los guiones piden.
 *
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/listar-copropiedades.mjs
 */
import { crearCliente } from './lib/supabase-admin.mjs';

const cliente = crearCliente();
const activas = await cliente.copropiedadesActivas();

if (activas.length === 0) {
  console.log('No hay ninguna copropiedad activa en este proyecto.');
  console.log('  Crea la primera con:');
  console.log('    node scripts/registrar-copropiedad.mjs --nombre "..." --nit "..."');
  process.exit(0);
}

console.log(`${activas.length} copropiedad(es) activa(s):\n`);
for (const c of activas) {
  console.log(`  ${c.id}`);
  console.log(`    ${c.nombre}  ·  NIT ${c.nit}\n`);
}
console.log('Usa el identificador en --copropiedad de scripts/aprovisionar-rol.mjs');
