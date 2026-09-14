'use client';

import type { JSX } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import type { Persona, TipoDeDocumento } from '@ncr/contracts';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { usePersonas } from '@/lib/api/consultas';
import { cn } from '@/lib/cn';
import { Boton } from './ui/boton';
import { Campo } from './ui/campo';

/**
 * Buscador de personas — **D-72: nadie escribe un UUID**.
 *
 * El formulario de autorización pedía «Persona que visita (identificador)» y
 * respondía `personaId must be a UUID` a quien escribiera un nombre. El defecto
 * no era el mensaje: era pedir un dato interno. Quien autoriza tiene a mano un
 * nombre y una cédula, y la identidad debe quedar bien formada sin que sepa que
 * existe un identificador.
 *
 * **Buscar y crear en el mismo paso, y no en dos pantallas.** El visitante
 * habitual ya está en el padrón —es el hermano, la empleada, el domiciliario— y
 * el nuevo no debería obligar a abandonar la autorización a medio escribir. Por
 * eso el alta vive dentro del desplegable: es la última opción de la lista,
 * después de haber comprobado que no está.
 *
 * **El documento ES la identidad (RN-06).** Si se da de alta a alguien cuyo
 * documento ya existe, la API devuelve la persona que ya había en vez de crear
 * una segunda, y este componente lo DICE: «ya estaba registrada como …». Sin
 * ese aviso, el nombre que se acaba de teclear se perdería en silencio y dos
 * personas distintas podrían parecer la misma.
 */
export interface PersonaElegida {
  readonly id: string;
  readonly nombreCompleto: string;
  readonly documento: string;
}

const TIPOS: readonly { readonly valor: TipoDeDocumento; readonly etiqueta: string }[] = [
  { valor: 'cedula', etiqueta: 'Cédula de ciudadanía' },
  { valor: 'cedula_extranjeria', etiqueta: 'Cédula de extranjería' },
  { valor: 'pasaporte', etiqueta: 'Pasaporte' },
  { valor: 'nit', etiqueta: 'NIT' },
  { valor: 'otro', etiqueta: 'Otro' },
];

/** Milisegundos de espera antes de consultar. Ver la nota de `useEffect`. */
const ESPERA = 250;

const descripcionDe = (p: Persona): string =>
  [
    `doc. ${p.numeroDocumento}`,
    p.esResidente
      ? `residente${p.viviendaIdentificador === null ? '' : ` de ${p.viviendaIdentificador}`}`
      : null,
  ]
    .filter((x): x is string => x !== null)
    .join(' · ');

export interface PropiedadesDeBuscadorDePersonas {
  readonly copropiedadId: string;
  readonly elegida: PersonaElegida | null;
  readonly alElegir: (persona: PersonaElegida | null) => void;
  readonly etiqueta?: string;
  readonly ayuda?: string;
  readonly error?: string | undefined;
}

export const BuscadorDePersonas = ({
  copropiedadId,
  elegida,
  alElegir,
  etiqueta = 'Persona que visita',
  ayuda = 'Búscala por nombre o documento. Si no aparece, se registra aquí mismo.',
  error,
}: PropiedadesDeBuscadorDePersonas): JSX.Element => {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [diferido, setDiferido] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const [creando, setCreando] = useState(false);
  const [tipoDocumento, setTipoDocumento] = useState<TipoDeDocumento>('cedula');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>(undefined);
  const [fallo, setFallo] = useState<string | undefined>(undefined);
  const contenedor = useRef<HTMLDivElement>(null);

  /**
   * El texto se difiere 250 ms antes de consultar. Sin esto, escribir «Ana
   * María» lanza nueve peticiones de las que ocho ya no interesan a nadie, y el
   * límite por identidad de §2.7.5 se dispara con el uso normal.
   */
  useEffect(() => {
    const t = setTimeout(() => setDiferido(texto), ESPERA);
    return () => clearTimeout(t);
  }, [texto]);

  const consulta = usePersonas(copropiedadId, diferido);
  const resultados = consulta.data ?? [];

  useEffect(() => setResaltado(0), [diferido]);

  // Cerrar al pulsar fuera: si no, el desplegable tapa los campos siguientes.
  useEffect(() => {
    if (!abierto) return undefined;
    const alPulsar = (e: MouseEvent): void => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alPulsar);
    return () => document.removeEventListener('mousedown', alPulsar);
  }, [abierto]);

  const elegir = (p: Persona): void => {
    alElegir({ id: p.id, nombreCompleto: p.nombreCompleto, documento: p.numeroDocumento });
    setAbierto(false);
    setCreando(false);
    setAviso(undefined);
    setTexto('');
  };

  const abrirAlta = (): void => {
    // Lo tecleado se reparte según qué parezca: si son dígitos, es el
    // documento; si no, el nombre. Volver a escribirlo sería el peaje más
    // tonto del formulario.
    const soloDigitos = /^[\d.\s-]+$/.test(texto.trim()) && texto.trim() !== '';
    setNumeroDocumento(soloDigitos ? texto.trim() : '');
    setNombre(soloDigitos ? '' : texto.trim());
    setCreando(true);
    setAbierto(false);
    setFallo(undefined);
  };

  const crear = async (): Promise<void> => {
    setGuardando(true);
    setFallo(undefined);
    try {
      const creada = desenvolver(
        await cliente.POST('/copropiedades/{id}/padron/personas', {
          params: { path: { id: copropiedadId } },
          body: { tipoDocumento, numeroDocumento, nombreCompleto: nombre },
        }),
      );
      alElegir({
        id: creada.id,
        nombreCompleto: creada.nombreCompleto,
        documento: numeroDocumento,
      });
      setAviso(
        creada.yaExistia
          ? `Ese documento ya estaba registrado como «${creada.nombreCompleto}». Se usa esa persona: el documento es la identidad.`
          : undefined,
      );
      setCreando(false);
      setTexto('');
    } catch (e) {
      setFallo(e instanceof ErrorDeApi ? e.message : 'No se pudo registrar la persona');
    } finally {
      setGuardando(false);
    }
  };

  if (elegida !== null) {
    return (
      <div className="space-y-1.5">
        <span className="block text-secundario font-medium text-texto">{etiqueta}</span>
        <div className="flex items-center justify-between gap-2 rounded-campo border border-borde bg-lienzo px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate text-cuerpo font-medium text-texto">
              {elegida.nombreCompleto}
            </span>
            <span className="block truncate text-secundario text-texto-apagado">
              doc. {elegida.documento}
            </span>
          </span>
          <Boton
            variante="fantasma"
            tamano="sm"
            type="button"
            onClick={() => {
              alElegir(null);
              setAviso(undefined);
            }}
          >
            <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            Cambiar
          </Boton>
        </div>
        {aviso !== undefined ? (
          <p role="status" className="text-secundario text-aviso-texto">
            {aviso}
          </p>
        ) : null}
      </div>
    );
  }

  if (creando) {
    return (
      <div className="space-y-3 rounded-campo border border-borde bg-lienzo p-3">
        <p className="text-secundario font-medium text-texto">Registrar una persona nueva</p>
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium text-texto">Tipo de documento</span>
          <select
            value={tipoDocumento}
            onChange={(e) => setTipoDocumento(e.target.value as TipoDeDocumento)}
            className="w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <Campo
          etiqueta="Número de documento"
          value={numeroDocumento}
          onChange={(e) => setNumeroDocumento(e.target.value)}
          ayuda="Se admite con puntos: 12.345.678 y 12345678 son la misma persona."
          required
        />
        <Campo
          etiqueta="Nombre completo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        {fallo !== undefined ? (
          <p role="alert" className="text-secundario text-peligro-texto">
            {fallo}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Boton
            type="button"
            variante="secundario"
            tamano="sm"
            onClick={() => setCreando(false)}
            disabled={guardando}
          >
            Cancelar
          </Boton>
          <Boton
            type="button"
            tamano="sm"
            cargando={guardando}
            disabled={numeroDocumento.trim().length < 4 || nombre.trim().length < 2}
            onClick={() => void crear()}
          >
            Registrar y usar
          </Boton>
        </div>
      </div>
    );
  }

  const suficiente = texto.trim().length >= 2;
  const listado = `${id}-listado`;

  return (
    <div ref={contenedor} className="relative space-y-1.5">
      <label htmlFor={id} className="block text-secundario font-medium text-texto">
        {etiqueta}
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-apagado"
          strokeWidth={1.75}
        />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={abierto && suficiente}
          aria-controls={listado}
          aria-autocomplete="list"
          aria-invalid={error !== undefined}
          aria-describedby={`${id}-ayuda`}
          autoComplete="off"
          placeholder="Nombre o documento…"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAbierto(false);
              return;
            }
            if (resultados.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setResaltado((i) => (i + 1) % resultados.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setResaltado((i) => (i - 1 + resultados.length) % resultados.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const p = resultados[resaltado];
              if (p !== undefined) elegir(p);
            }
          }}
          className={cn(
            'h-11 w-full rounded-campo border bg-campo pl-9 pr-3 text-cuerpo text-texto',
            'placeholder:text-texto-apagado',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto focus-visible:ring-offset-1',
            error === undefined ? 'border-borde' : 'border-peligro-texto',
          )}
        />
      </div>
      <p id={`${id}-ayuda`} className="text-secundario text-texto-apagado">
        {ayuda}
      </p>
      {error !== undefined ? (
        <p role="alert" className="text-secundario text-peligro-texto">
          {error}
        </p>
      ) : null}

      {abierto && suficiente ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-full origin-top overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-flotante motion-safe:animate-desplegar">
          <ul id={listado} role="listbox" aria-label="Personas encontradas" className="py-1">
            {consulta.isFetching && resultados.length === 0 ? (
              <li className="px-3 py-2 text-secundario text-texto-apagado">Buscando…</li>
            ) : null}
            {resultados.map((p, indice) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={indice === resaltado}
                  onMouseEnter={() => setResaltado(indice)}
                  onClick={() => elegir(p)}
                  className={cn(
                    'flex w-full flex-col items-start px-3 py-2 text-left transition-colors duration-100 ease-salida motion-reduce:transition-none',
                    indice === resaltado ? 'bg-lienzo' : 'bg-transparent',
                  )}
                >
                  <span className="text-cuerpo font-medium text-texto">{p.nombreCompleto}</span>
                  <span className="text-secundario text-texto-apagado">{descripcionDe(p)}</span>
                </button>
              </li>
            ))}
            {!consulta.isFetching && resultados.length === 0 ? (
              <li className="px-3 pb-1 pt-2 text-secundario text-texto-apagado">
                Nadie con «{texto.trim()}» en esta copropiedad.
              </li>
            ) : null}
            {/* El alta va SIEMPRE al final, también cuando hay resultados: quizá
                el visitante es un homónimo del que sí está. */}
            <li className="border-t border-borde">
              <button
                type="button"
                onClick={abrirAlta}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-secundario text-marca-texto transition-colors duration-100 ease-salida hover:bg-lienzo motion-reduce:transition-none"
              >
                <UserPlus aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                Registrar a «{texto.trim()}» como persona nueva
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
};
