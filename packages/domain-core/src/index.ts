/**
 * API pública de `@ncr/domain-core` — el barril de §2.2.
 *
 * Nadie importa rutas internas de este paquete: `exports` en package.json
 * solo publica esta entrada, así que la frontera la impone Node, no la
 * disciplina de quien escribe el import.
 */
export * from './compartido/resultado';
export * from './compartido/errores';
export * from './puertos/soporte';
export * from './puertos/repositorios';
export * from './puertos/proveedores';
export * from './eventos/evento-de-dominio';
export * from './eventos/bus-en-memoria';
export * from './politicas/idempotencia';
export * from './padron/placa';
export * from './padron/vivienda';
export * from './tokens';
