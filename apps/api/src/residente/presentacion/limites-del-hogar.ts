/**
 * RONDA 15-W (D-W7, §7) · los vehículos del residente tienen su propio límite:
 * 20 peticiones cada 60 s, en todas sus rutas (registrar, dar de baja, editar y
 * eliminar). Aquí, y no en cada controlador, para que sea UNA cifra.
 */
export const LIMITE_DE_VEHICULOS = { default: { limit: 20, ttl: 60_000 } };
