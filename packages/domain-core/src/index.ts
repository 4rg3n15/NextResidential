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
export * from './eventos/acceso';
export * from './eventos/alerta';
export * from './eventos/politica-alertas';
export * from './eventos/latido';
export * from './eventos/filtro-eventos';
export * from './politicas/idempotencia';
export * from './padron/placa';
export * from './padron/vivienda';
export * from './autorizaciones/vigencia';
export * from './autorizaciones/patron-recurrencia';
export * from './autorizaciones/version-de-reglas';
export * from './autorizaciones/autorizacion';
export * from './zonas/aforo';
export * from './zonas/horario-zona';
export * from './zonas/politica-reinicio';
export * from './zonas/zona';
export * from './biometria/calidad-captura';
export * from './biometria/consentimiento';
export * from './biometria/plantilla';
export * from './biometria/politica-consentimiento';
export * from './reglas/resultado-acceso';
export * from './reglas/contexto';
export * from './reglas/politicas';
export * from './reglas/motor';
export * from './tokens';
export * from './tiempo/ventana-del-dia';
