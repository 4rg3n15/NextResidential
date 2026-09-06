# Reversión de migraciones

`supabase db push` no aplica migraciones «hacia abajo»: el CLI de Supabase no
tiene el concepto de *down migration*. La reversibilidad que exige
`CLAUDE.md` §6 se cubre aquí, con guiones explícitos que deshacen cada
migración en orden inverso.

**Cómo se usan.** Manualmente y en orden descendente, con el rol de
mantenimiento. Nunca en producción sin respaldo previo.

```
psql -f reversion/0015_revert.sql
psql -f reversion/0014_revert.sql
...
```

**Advertencia sobre `eventos`.** Revertir la migración 0011 elimina la tabla de
eventos y todas sus particiones. Es una operación destructiva sobre un registro
que RN-03 declara inmutable: exige respaldo verificado y autorización escrita.
El guion la exige explícitamente mediante una variable de confirmación.
