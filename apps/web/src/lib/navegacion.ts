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
] as const;
export type NombreDeIcono = (typeof ICONOS_DE_NAVEGACION)[number];

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
  /**
   * ETAPA 15 · anticipo autorizado del punto 4 de la ETAPA 16.
   *
   * Va junto a Visitantes y no en Dispositivos porque lo que se captura es el
   * rostro de **una persona que visita**, y quien lo hace está atendiéndola.
   * Colgarlo del inventario de equipos lo habría convertido en una tarea de
   * mantenimiento, que es justo lo que no es.
   */
  {
    clave: 'biometria',
    etiqueta: 'Rostro del visitante',
    ruta: '/biometria',
    roles: OPERACION,
    pendienteDeEtapa: null,
    icono: 'ScanFace',
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
    roles: ['superadministrador', 'administrador', 'operador_central'],
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
