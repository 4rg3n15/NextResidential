import type { Rol } from '@ncr/contracts';

/**
 * Navegación de la consola y **visibilidad por rol**.
 *
 * Los nueve elementos son los del mockup (W-02…W-08, W-10) y su orden es el
 * dibujado. Lo que el mockup no dice —y esta tabla sí— es quién ve cada uno.
 *
 * **La interfaz oculta; no protege.** El backend ya deniega por `@Roles()`, y
 * esta tabla existe para que un portero no vea nueve entradas de las que siete
 * le van a devolver 403. Si las dos se separan, el síntoma es un menú que
 * lleva a pantallas vacías, no una fuga: la autoridad sigue siendo el guard.
 *
 * `etapa` marca lo que aún no existe. Un enlace a una pantalla no construida es
 * peor que ninguno: el usuario la da por rota. La consola los muestra
 * deshabilitados y con su etapa, que es información honesta.
 */
export interface ElementoDeNavegacion {
  readonly clave: string;
  readonly etiqueta: string;
  readonly ruta: string;
  readonly roles: readonly Rol[];
  /** Etapa que la construye; `null` si ya está disponible. */
  readonly pendienteDeEtapa: string | null;
}

const ADMINISTRACION: readonly Rol[] = ['superadministrador', 'administrador'];
const OPERACION: readonly Rol[] = [
  'superadministrador',
  'administrador',
  'portero',
  'operador_central',
];

export const NAVEGACION: readonly ElementoDeNavegacion[] = [
  {
    clave: 'tablero',
    etiqueta: 'Dashboard',
    ruta: '/tablero',
    roles: OPERACION,
    pendienteDeEtapa: null,
  },
  {
    clave: 'viviendas',
    etiqueta: 'Viviendas',
    ruta: '/viviendas',
    roles: ADMINISTRACION,
    pendienteDeEtapa: null,
  },
  {
    clave: 'vehiculos',
    etiqueta: 'Vehículos',
    ruta: '/vehiculos',
    roles: ADMINISTRACION,
    pendienteDeEtapa: null,
  },
  {
    clave: 'visitantes',
    etiqueta: 'Visitantes',
    ruta: '/visitantes',
    roles: OPERACION,
    pendienteDeEtapa: null,
  },
  {
    clave: 'zonas',
    etiqueta: 'Zonas Comunes',
    ruta: '/zonas',
    roles: OPERACION,
    pendienteDeEtapa: null,
  },
  {
    clave: 'dispositivos',
    etiqueta: 'Dispositivos',
    ruta: '/dispositivos',
    roles: ADMINISTRACION,
    pendienteDeEtapa: null,
  },
  {
    clave: 'eventos',
    etiqueta: 'Eventos',
    ruta: '/eventos',
    roles: OPERACION,
    pendienteDeEtapa: null,
  },
  {
    clave: 'informes',
    etiqueta: 'Informes',
    ruta: '/informes',
    roles: ADMINISTRACION,
    pendienteDeEtapa: null,
  },
  {
    clave: 'configuracion',
    etiqueta: 'Configuración',
    ruta: '/configuracion',
    roles: ADMINISTRACION,
    pendienteDeEtapa: '09-B',
  },
];

export const navegacionDe = (rol: Rol): readonly ElementoDeNavegacion[] =>
  NAVEGACION.filter((e) => e.roles.includes(rol));

/** Texto en español de cada rol, para la cabecera y el menú de usuario. */
export const NOMBRE_DE_ROL: Readonly<Record<Rol, string>> = {
  superadministrador: 'Superadministrador',
  administrador: 'Administrador',
  portero: 'Portería / Seguridad',
  operador_central: 'Operador de central',
  residente: 'Residente',
  servicio: 'Servicio / Integración',
};

/**
 * Ruta de aterrizaje tras el acceso.
 *
 * El residente **no tiene consola web**: su superficie es la app Flutter de la
 * ETAPA 11. Se le dice, en vez de dejarlo en un tablero vacío sin explicación.
 * La identidad de servicio no es una persona y nunca inicia sesión aquí.
 */
export const rutaInicialDe = (rol: Rol): string => {
  if (rol === 'residente' || rol === 'servicio') return '/sin-consola';
  return '/tablero';
};
