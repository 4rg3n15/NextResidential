import {
  Baby,
  Bike,
  Building2,
  Car,
  Dog,
  DoorOpen,
  Dumbbell,
  Flame,
  Gamepad2,
  PartyPopper,
  Sun,
  Tent,
  Trees,
  Users,
  Utensils,
  Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Catálogo CERRADO de iconos de zona (O3, ADR-013).
 *
 * La API guarda un nombre (`^[a-z0-9-]{1,40}$`) y no decide qué dibujo es: la
 * consola lo resuelve aquí. Un nombre que no esté en el catálogo —de otra
 * versión de la consola, o escrito a mano— cae al icono neutro en vez de
 * romper la tarjeta. Es presentación: el dominio no lee este campo.
 */
export const ICONOS_DE_ZONA: Readonly<
  Record<string, { readonly icono: LucideIcon; readonly etiqueta: string }>
> = {
  waves: { icono: Waves, etiqueta: 'Piscina' },
  dumbbell: { icono: Dumbbell, etiqueta: 'Gimnasio' },
  'party-popper': { icono: PartyPopper, etiqueta: 'Salón de eventos' },
  utensils: { icono: Utensils, etiqueta: 'BBQ / cocina' },
  flame: { icono: Flame, etiqueta: 'Zona de asados' },
  trees: { icono: Trees, etiqueta: 'Zona verde' },
  baby: { icono: Baby, etiqueta: 'Parque infantil' },
  gamepad: { icono: Gamepad2, etiqueta: 'Juegos' },
  users: { icono: Users, etiqueta: 'Reuniones' },
  car: { icono: Car, etiqueta: 'Parqueadero' },
  bike: { icono: Bike, etiqueta: 'Bicicletero' },
  dog: { icono: Dog, etiqueta: 'Zona de mascotas' },
  sun: { icono: Sun, etiqueta: 'Terraza' },
  tent: { icono: Tent, etiqueta: 'Camping / kiosco' },
  'door-open': { icono: DoorOpen, etiqueta: 'Acceso' },
};

export const ICONO_NEUTRO: LucideIcon = Building2;

/** El icono de un nombre guardado; neutro si no está en el catálogo o es nulo. */
export const iconoDeZona = (nombre: string | null | undefined): LucideIcon =>
  nombre === null || nombre === undefined
    ? ICONO_NEUTRO
    : (ICONOS_DE_ZONA[nombre]?.icono ?? ICONO_NEUTRO);

/** Nombres válidos para el selector, con su etiqueta. */
export const OPCIONES_DE_ICONO = Object.entries(ICONOS_DE_ZONA).map(([valor, { etiqueta }]) => ({
  valor,
  etiqueta,
}));
