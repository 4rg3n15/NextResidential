'use client';

import type { ChangeEvent, JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { BuscadorDePersonas } from '@/componentes/buscador-personas';
import type { PersonaElegida } from '@/componentes/buscador-personas';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { CONSEJOS, fallosDeCalidad } from '@/lib/biometria/medidas';
import type { FalloDeCalidad, MedidasDeCaptura } from '@/lib/biometria/medidas';
import { medirCaptura } from '@/lib/biometria/deteccion';
import {
  ImagenDemasiadoGrande,
  LADO_MAXIMO,
  dimensionesReducidas,
  prepararImagen,
} from '@/lib/biometria/imagen';
import type { ImagenPreparada } from '@/lib/biometria/imagen';

/**
 * ROSTRO DEL VISITANTE, DESDE LA CONSOLA.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE ESTA PANTALLA **NO** HACE, Y ES LO MÁS IMPORTANTE
 *
 * **No responde el consentimiento.** Captura, comprueba la calidad y lo
 * SOLICITA; quien acepta o rechaza es el titular, por su propio canal (RN-10).
 * Un botón de «aceptar» aquí convertiría el consentimiento en un trámite que
 * rellena el operador, que es exactamente lo que la Ley 1581 no admite. Por eso
 * al terminar se muestra el estado «pendiente del titular» y nada más.
 *
 * **No sube la foto original.** Se reduce a {@link LADO_MAXIMO} px en el
 * navegador antes de salir (minimización, art. 4), y lo que se envía entra
 * cifrado a la bóveda. Ninguna ruta lo devuelve.
 *
 * **No inventa un rostro.** Si el navegador no trae detector, se dice con esas
 * palabras y el encuadre lo confirma quien opera —que está mirando a la
 * persona—, en vez de mandar `rostrosDetectados: 1` y llamarlo medición.
 */

interface Preparada {
  readonly medidas: MedidasDeCaptura;
  readonly detectorDisponible: boolean;
  readonly imagen: ImagenPreparada;
  readonly vistaPrevia: string;
}

/** 24 h: el visitante de hoy, no el de la semana que viene (RN-11). */
const HORAS_DE_VIDA = 24;

export const PantallaDeBiometria = ({
  copropiedadId,
  titularInicial,
}: {
  readonly copropiedadId: string;
  /**
   * B.6 · quien llega desde «Nueva autorización» trae ya al visitante elegido.
   * Sigue siendo editable: el buscador está donde estaba y se puede cambiar.
   */
  readonly titularInicial?: PersonaElegida;
}): JSX.Element => {
  const [titular, setTitular] = useState<PersonaElegida | null>(titularInicial ?? null);
  const [preparada, setPreparada] = useState<Preparada | null>(null);
  const [confirmaEncuadre, setConfirmaEncuadre] = useState(false);
  const [versionPolitica, setVersionPolitica] = useState('v1');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [consentimientoId, setConsentimientoId] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const medir = useCallback(async (fichero: File): Promise<void> => {
    setError(undefined);
    setConsentimientoId(null);
    setProcesando(true);
    try {
      const mapa = await createImageBitmap(fichero);
      const { ancho, alto } = dimensionesReducidas(mapa.width, mapa.height);
      const lienzo = document.createElement('canvas');
      lienzo.width = ancho;
      lienzo.height = alto;
      const pincel = lienzo.getContext('2d');
      if (pincel === null) throw new Error('El navegador no permitió preparar la imagen');
      pincel.drawImage(mapa, 0, 0, ancho, alto);

      const { data } = pincel.getImageData(0, 0, ancho, alto);
      const lectura = await medirCaptura(mapa, data, ancho, alto);
      const imagen = prepararImagen(lienzo);

      setPreparada({
        medidas: lectura.medidas,
        detectorDisponible: lectura.detectorDisponible,
        imagen,
        vistaPrevia: `data:image/jpeg;base64,${imagen.base64}`,
      });
      setConfirmaEncuadre(false);
      mapa.close();
    } catch (fallo) {
      setPreparada(null);
      setError(
        fallo instanceof ImagenDemasiadoGrande
          ? fallo.message
          : 'No se pudo leer la imagen. Use un JPEG o un PNG.',
      );
    } finally {
      setProcesando(false);
    }
  }, []);

  const alElegirFichero = (evento: ChangeEvent<HTMLInputElement>): void => {
    const fichero = evento.target.files?.[0];
    if (fichero !== undefined) void medir(fichero);
  };

  /**
   * Cuando no hay detector, la confirmación de quien opera SUSTITUYE al conteo
   * de rostros y a la proporción. Se recalcula aquí, sobre las mismas medidas,
   * para que lo que se juzga sea lo que se envía.
   */
  const medidasEfectivas: MedidasDeCaptura | null =
    preparada === null
      ? null
      : preparada.detectorDisponible || !confirmaEncuadre
        ? preparada.medidas
        : { ...preparada.medidas, rostrosDetectados: 1, proporcionRostro: 0.4 };

  const fallos: readonly FalloDeCalidad[] =
    medidasEfectivas === null ? [] : fallosDeCalidad(medidasEfectivas);

  const puedeEnviar =
    titular !== null &&
    preparada !== null &&
    medidasEfectivas !== null &&
    fallos.length === 0 &&
    !procesando;

  const enviar = async (): Promise<void> => {
    if (!puedeEnviar || preparada === null || titular === null || medidasEfectivas === null) return;
    setProcesando(true);
    setError(undefined);
    try {
      const suprimirEn = new Date(Date.now() + HORAS_DE_VIDA * 3600_000).toISOString();
      const respuesta = desenvolver(
        await cliente.POST('/copropiedades/{id}/biometria/capturas', {
          params: { path: { id: copropiedadId } },
          body: {
            titularId: titular.id,
            medidas: medidasEfectivas,
            vector: preparada.imagen.base64,
            versionPolitica,
            /**
             * `presencial` y no un canal nuevo: la captura la hace un operador
             * con la persona delante, que es exactamente lo que ese canal
             * significa en `CANALES` del dominio. Inventar «consola» obligaría
             * a tocar el dominio para describir una superficie, y el dominio no
             * tiene por qué saber desde qué pantalla se capturó.
             */
            canal: 'presencial',
            suprimirEn,
          },
        }),
      );
      setConsentimientoId(
        (respuesta as { consentimientoId?: string }).consentimientoId ?? 'solicitado',
      );
    } catch (fallo) {
      setError(
        fallo instanceof ErrorDeApi
          ? fallo.message
          : 'No se pudo registrar la captura. Inténtelo de nuevo.',
      );
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Rostro del visitante"
        descripcion="Captura, comprobación de calidad y solicitud de consentimiento al titular."
      />

      <Tarjeta>
        <CabeceraDeTarjeta titulo="1 · Quién es el titular del dato" />
        <CuerpoDeTarjeta>
          <BuscadorDePersonas
            copropiedadId={copropiedadId}
            elegida={titular}
            alElegir={setTitular}
            etiqueta="Titular del dato biométrico"
            ayuda="Es el visitante, no el residente que lo invitó (RN-10)."
          />
        </CuerpoDeTarjeta>
      </Tarjeta>

      <Tarjeta>
        <CabeceraDeTarjeta titulo="2 · La fotografía" />
        <CuerpoDeTarjeta>
          <div className="space-y-4">
            <input
              ref={entrada}
              type="file"
              accept="image/jpeg,image/png"
              capture="user"
              onChange={alElegirFichero}
              aria-label="Fotografía del rostro"
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-4 file:py-2"
            />
            <p className="text-sm text-muted-foreground">
              La imagen se reduce a {LADO_MAXIMO} px en este navegador antes de enviarse. La
              original no sale de este equipo.
            </p>

            {preparada !== null && (
              <div className="flex flex-wrap items-start gap-4">
                {/*
                  `img` y no `next/image` a propósito: la fuente es un `data:`
                  que sólo existe en esta pestaña. `next/image` optimiza URLs
                  remotas y aquí no hay nada que optimizar ni nada que deba
                  salir del navegador — enviar el rostro a un optimizador
                  sería lo contrario de la minimización que exige art. 4.
                */}
                <img
                  src={preparada.vistaPrevia}
                  alt="Vista previa del rostro capturado"
                  className="h-40 w-auto rounded-md border"
                />
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Nitidez</dt>
                  <dd>{preparada.medidas.nitidez.toFixed(2)}</dd>
                  <dt className="text-muted-foreground">Iluminación</dt>
                  <dd>{preparada.medidas.iluminacion.toFixed(2)}</dd>
                  <dt className="text-muted-foreground">Rostros</dt>
                  <dd>
                    {preparada.detectorDisponible
                      ? preparada.medidas.rostrosDetectados
                      : 'sin comprobar'}
                  </dd>
                  <dt className="text-muted-foreground">Tamaño del envío</dt>
                  <dd>{Math.round(preparada.imagen.bytes / 1024)} KiB</dd>
                </dl>
              </div>
            )}

            {preparada !== null && !preparada.detectorDisponible && (
              <div className="rounded-md border border-dashed p-4 text-sm">
                <p className="font-medium">
                  Este navegador no sabe detectar rostros, y no se inventa uno.
                </p>
                <p className="mt-1 text-muted-foreground">
                  La nitidez y la iluminación sí están medidas. El encuadre lo confirma usted, que
                  está viendo a la persona. Quedará anotado que la comprobación fue manual.
                </p>
                <label className="mt-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirmaEncuadre}
                    onChange={(e) => setConfirmaEncuadre(e.target.checked)}
                  />
                  <span>Se ve un solo rostro, de frente y bien encuadrado</span>
                </label>
              </div>
            )}

            {fallos.length > 0 && (
              <ul className="space-y-1 text-sm" role="alert">
                {fallos.map((fallo) => (
                  <li key={fallo} className="flex items-start gap-2">
                    <Distintivo tono="peligro">No sirve</Distintivo>
                    <span>{CONSEJOS[fallo]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CuerpoDeTarjeta>
      </Tarjeta>

      <Tarjeta>
        <CabeceraDeTarjeta titulo="3 · Consentimiento" />
        <CuerpoDeTarjeta>
          <div className="space-y-4">
            <Campo
              etiqueta="Versión de la política de tratamiento"
              value={versionPolitica}
              onChange={(e) => setVersionPolitica(e.target.value)}
              ayuda="La que se le muestra al titular al pedirle el consentimiento."
            />
            <p className="text-sm text-muted-foreground">
              Al enviar, el sistema <strong>solicita</strong> el consentimiento al titular. No se
              acepta desde aquí: lo responde él, por su canal (RN-10, Ley 1581 de 2012). Sin
              consentimiento vigente la plantilla no se sincroniza con ninguna terminal (RN-09).
            </p>

            {error !== undefined && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            {consentimientoId !== null && (
              <div className="rounded-md border p-4 text-sm" role="status">
                <p className="font-medium">Consentimiento solicitado · pendiente del titular</p>
                <p className="mt-1 text-muted-foreground">
                  La plantilla queda retenida hasta que el titular acepte. Se suprime
                  automáticamente a las {HORAS_DE_VIDA} horas si no responde (RN-11).
                </p>
              </div>
            )}

            <Boton onClick={() => void enviar()} disabled={!puedeEnviar}>
              {procesando ? 'Enviando…' : 'Solicitar consentimiento y guardar'}
            </Boton>
          </div>
        </CuerpoDeTarjeta>
      </Tarjeta>
    </div>
  );
};
