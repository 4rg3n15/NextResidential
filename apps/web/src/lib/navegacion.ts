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
  /**
   * Nombre del icono de Lucide (ADR-013). Va en la tabla y no en el componente
   * para que añadir una entrada sea una línea y no dos ficheros — que es como
   * acaban existiendo elementos sin icono.
   */
  readonly icono: NombreDeIcono;
}

/**
 * Los iconos se enumeran a propósito en vez de aceptar cualquier cadena: un
 * nombre mal escrito sería un hueco silencioso en la barra, y así no compila.
 */
export const ICONOS_DE_NAVEGACION = [
  'LayoutDashboard',
  'Building2',
  'Car',
  'UserRoundCheck',
  'Trees',
  'Cpu',
  'ScrollText',
  'FileBarChart',
  'Settings',
  'DoorOpen',
  'RadioTower',
  'Gauge',
  // ETAPA 15 · la captura biométrica desde la consola.
  'ScanFace',
  // ETAPA 15-H · supervisión de portería y perfil del portero.
  'UsersRound',
  'IdCard',
  // ETAPA 15-I · supervisión de residentes: cuentas, ocupantes y vehículos propios.
  'UserCog',
  // ETAPA 15-I · HU-35 · la lista negra desde la consola.
  'ShieldBan',
  // ETAPA 15-M (C3, D-12) · el menú del residente: sus ocho pantallas.
  'House',
  'Users',
  'UserRoundPlus',
  'History',
  'Bell',
  'CircleUserRound',
] as const;
export type NombreDeIcono = (typeof ICONOS_DE_NAVEGACION)[number];

const ADMINISTRACION: readonly Rol[] = ['superadministrador', 'administrador'];
const OPERACION: readonly Rol[] = [
  'superadministrador',
  'administrador',
  'portero',
  'operador_central',
];

/**
 * ETAPA 15-M (C3, D-12) · EL RESIDENTE EN LA CONSOLA WEB.
 *
 * Decisión del cliente del 2026-09-29: el residente opera también desde el
 * navegador, con las MISMAS funciones que la app (C-44). Su menú es SÓLO el
 * suyo —las ocho pantallas del mockup móvil, en el mismo orden— y ninguna
 * entrada de administración, portería ni guardia lo lleva como rol: la
 * interfaz oculta, y la API deniega por `@Roles('residente')` en cada ruta.
 * Todas cuelgan de `/mi`, que es la misma raíz de la API (`…/mi/…`): la
 * vivienda la resuelve el servidor desde el token y nunca viaja en la URL.
 *
 * [SUPUESTO] S-150 · «Perfil» del residente es `/mi/perfil` con clave propia
 * (`mi-perfil-residente`): `/mi-perfil` es la ficha del portero y no se
 * mezcla con el perfil de la vivienda.
 */
const PANTALLAS_DEL_RESIDENTE: readonly Pick<
  ElementoDeNavegacion,
  'clave' | 'etiqueta' | 'ruta' | 'icono'
>[] = [
  { clave: 'mi', etiqueta: 'Mi vivienda', ruta: '/mi', icono: 'House' },
  { clave: 'mi-familia', etiqueta: 'Mi familia', ruta: '/mi/familia', icono: 'Users' },
  { clave: 'mi-vehiculos', etiqueta: 'Mis vehículos', ruta: '/mi/vehiculos', icono: 'Car' },
  { clave: 'mi-visitas', etiqueta: 'Visitas', ruta: '/mi/visitas', icono: 'UserRoundPlus' },
  { clave: 'mi-zonas', etiqueta: 'Zonas comunes', ruta: '/mi/zonas', icono: 'Trees' },
  { clave: 'mi-historial', etiqueta: 'Historial', ruta: '/mi/historial', icono: 'History' },
  {
    clave: 'mi-notificaciones',
    etiqueta: 'Notificaciones',
    ruta: '/mi/notificaciones',
    icono: 'Bell',
  },
  {
    clave: 'mi-perfil-residente',
    etiqueta: 'Perfil',
    ruta: '/mi/perfil',
    icono: 'CircleUserRound',
  },
];
const RESIDENTE: readonly ElementoDeNavegacion[] = PANTALLAS_DEL_RESIDENTE.map((e) => ({
  ...e,
  roles: ['residente'],
  pendienteDeEtapa: null,
}));

export const NAVEGACION: readonly ElementoDeNavegacion[] = [
  {
    clave: 'tablero',
    etiqueta: 'Dashboard',
    ruta: '/tablero',
    /**
     * 15-L · sin el portero. La API nunca le dio los indicadores del tablero
     * (administración y central), y la consola lo aterrizaba ahí: tres
     * rechazos en la primera pantalla de su turno. Lo destapó el recorrido
     * de la entrega; el portero entra por Portería.
     */
    roles: ['superadministrador', 'administrador', 'operador_central'],
    pendienteDeEtapa: null,
    icono: 'LayoutDashboard',
  },
  {
    clave: 'viviendas',
    etiqueta: 'Viviendas',
    ruta: '/viviendas',
    roles: ADMINISTRACION,
    pendienteDeEtapa: null,
    icono: 'Building2',
  },
  {
    clave: 'vehiculos',
    etiqueta: 'Vehículos',
    ruta: '/vehiculos',
    roles: ADMINISTRACION,
    pendienteDeEtapa: null,
    icono: 'Car',
  },
  {
    clave: 'visitantes',
    etiqueta: 'Visitantes',
    ruta: '/visitantes',
    roles: OPERACION,
    pendienteDeEtapa: null,
    icono: 'UserRoundCheck',
  },
  /**
   * ETAPA 15-I · HU-35 · RN-07 · la lista negra. Junto a Visitantes porque es su
   * contrapeso: un veto niega aunque la autorización esté vigente (RN-06).
   * Vetan los cuatro roles de operación; levantar es de administración.
   */
  {
    clave: 'listas-negras',
    etiqueta: 'Listas negras',
    ruta: '/listas-negras',
    roles: OPERACION,
    pendienteDeEtapa: null,
    icono: 'ShieldBan',
  },
  {
    clave: 'zonas',
    etiqueta: 'Zonas Comunes',
    ruta: '/zonas',
    roles: OPERACION,
    pendienteDeEtapa: null,
    icono: 'Trees',
  },
  {
    clave: 'dispositivos',
    etiqueta: 'Dispositivos',
    ruta: '/dispositivos',
    roles: ADMINISTRACION,
    pendienteDeEtapa: null,
    icono: 'Cpu',
  },
  /**
   * Las dos consolas OPERATIVAS van juntas y antes de los eventos: quien las
   * usa entra a atender, no a consultar. El orden del menú es el orden en que
   * se usa la consola, no el orden en que se construyó.
   */
  {
    clave: 'porteria',
    etiqueta: 'Portería',
    ruta: '/porteria',
    roles: OPERACION,
    pendienteDeEtapa: null,
    icono: 'DoorOpen',
  },
  /**
   * ETAPA 15-H (B4, ADR-024) · supervisión de portería: porteros, turnos y
   * bitácora. Sólo el superadministrador; el administrador no asigna turnos.
   */
  {
    clave: 'porteros',
    etiqueta: 'Porteros',
    ruta: '/porteros',
    roles: ['superadministrador'],
    pendienteDeEtapa: null,
    icono: 'UsersRound',
  },
  /**
   * ETAPA 15-I (3.1, D5 a, D6) · supervisión de residentes: alta de cuentas por
   * usuario, plazas de ocupante y la vista de vehículos registrados por
   * residentes. Sólo el superadministrador, como los porteros.
   */
  {
    clave: 'residentes',
    etiqueta: 'Residentes',
    ruta: '/residentes',
    roles: ['superadministrador'],
    pendienteDeEtapa: null,
    icono: 'UserCog',
  },
  {
    clave: 'guardia',
    etiqueta: 'Guardia virtual',
    // C-12 · son DOS superficies, no una: el portero atiende su puerta y el
    // operador de central atiende varias copropiedades que no ve.
    ruta: '/guardia',
    // 15-L (H4) · y el portero: la guardia remota, desde las IP permitidas.
    roles: ['superadministrador', 'administrador', 'operador_central', 'portero'],
    pendienteDeEtapa: null,
    icono: 'RadioTower',
  },
  {
    clave: 'eventos',
    etiqueta: 'Eventos',
    ruta: '/eventos',
    roles: OPERACION,
    pendienteDeEtapa: null,
    icono: 'ScrollText',
  },
  {
    clave: 'informes',
    etiqueta: 'Informes',
    ruta: '/informes',
    roles: ADMINISTRACION,
    pendienteDeEtapa: null,
    icono: 'FileBarChart',
  },
  /**
   * ETAPA 14 · junto a informes y antes de configuración: es otra vista del
   * sistema, no un ajuste. La ve también el operador de central, que es quien
   * primero nota una latencia de intercom que se va del techo.
   */
  {
    clave: 'observabilidad',
    etiqueta: 'Latencias',
    ruta: '/observabilidad',
    roles: ['superadministrador', 'administrador', 'operador_central'],
    pendienteDeEtapa: null,
    icono: 'Gauge',
  },
  {
    clave: 'configuracion',
    etiqueta: 'Configuración',
    ruta: '/configuracion',
    roles: ADMINISTRACION,
    pendienteDeEtapa: null,
    icono: 'Settings',
  },
  /** ETAPA 15-H (E-02) · el portero ve su perfil y no lo edita. */
  {
    clave: 'mi-perfil',
    etiqueta: 'Mi perfil',
    ruta: '/mi-perfil',
    roles: ['portero'],
    pendienteDeEtapa: null,
    icono: 'IdCard',
  },
  ...RESIDENTE,
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
 * El residente aterriza en «Mi vivienda» (15-M, D-12): hasta esa decisión su
 * única superficie era la app Flutter y aquí se le mandaba a `/sin-consola`.
 * La identidad de servicio no es una persona y nunca inicia sesión aquí. El
 * portero empieza su turno en Portería, que es su pantalla.
 */
export const rutaInicialDe = (rol: Rol): string => {
  if (rol === 'servicio') return '/sin-consola';
  if (rol === 'residente') return '/mi';
  if (rol === 'portero') return '/porteria';
  return '/tablero';
};
