#!/usr/bin/env node
/**
 * Da de alta la PRIMERA copropiedad de un proyecto recién migrado.
 *
 * Es el primer paso del arranque en frío. Sobre una base recién migrada no hay
 * ninguna, y sin ella no se puede aprovisionar ningún rol: `roles_usuario`
 * exige `copropiedad_id` NOT NULL.
 *
 * No escribe la fila desde aquí: llama a `arranque_registrar_copropiedad`
 * (migración 0025), que se ejecuta **en una sola transacción**, valida sus
 * argumentos del lado de la base y atribuye la fila al **actor de sistema**.
 * Ese actor es lo que rompe el ciclo de auditoría —`creado_por` es NOT NULL y
 * apunta a `usuarios`, y en una base vacía no hay ningún usuario—, sin relajar
 * ninguna restricción.
 *
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *   node scripts/registrar-copropiedad.mjs \
 *     --nombre 'Urbanizacion Mira' --nit '900123456' [--zona-horaria America/Bogota]
 */
import { crearCliente, leerArgumentos, morir } from './lib/supabase-admin.mjs';

const args = leerArgumentos(process.argv.slice(2));
const nombre = args.nombre;
const nit = args.nit;
const zonaHoraria = args['zona-horaria'] ?? 'America/Bogota';

if (nombre === undefined || nit === undefined) {
  morir("Uso: --nombre '<nombre>' --nit '<nit>' [--zona-horaria <IANA>]");
}
if (nombre.trim().length < 3) morir('El nombre debe tener al menos 3 caracteres.');
if (!/^[0-9-]{5,20}$/.test(nit.trim())) {
  morir(`El NIT «${nit}» no tiene forma válida: solo dígitos y guiones, entre 5 y 20 caracteres.`);
}

const cliente = crearCliente();

const existentes = await cliente.copropiedadesActivas();
const yaEsta = existentes.find((c) => c.nit === nit.trim());
if (yaEsta !== undefined) {
  console.log(
    `\n· Ya existía una copropiedad con NIT ${nit.trim()}: ${yaEsta.id} (${yaEsta.nombre})`,
  );
  console.log('  El alta es idempotente; no se ha creado ninguna otra.\n');
  process.exit(0);
}

const id = await cliente.rpc('arranque_registrar_copropiedad', {
  p_nombre: nombre.trim(),
  p_nit: nit.trim(),
  p_zona_horaria: zonaHoraria,
});

console.log(`\n✓ Copropiedad creada\n  id            ${id}\n  nombre        ${nombre.trim()}`);
console.log(`  zona horaria  ${zonaHoraria}`);
console.log('\n  Siguiente paso: aprovisionar el superadministrador.');
console.log(`  node scripts/aprovisionar-rol.mjs --correo '<correo>' --rol superadministrador \\`);
console.log(`    --copropiedad '${id}' --nombre '<Nombre Apellido>'\n`);
