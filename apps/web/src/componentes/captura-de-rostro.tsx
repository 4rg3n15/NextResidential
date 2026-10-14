'use client';

import type { ChangeEvent, JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import type { FotoLista } from '@/componentes/captura-de-foto';
import { ImagenDemasiadoGrande } from '@/lib/biometria/imagen';
import { leerCaptura } from '@/lib/biometria/lectura';
import type { CapturaLeida } from '@/lib/biometria/lectura';
import { fallosDeCalidad } from '@/lib/biometria/medidas';
import type { MedidasDeCaptura } from '@/lib/biometria/medidas';
import { CONSEJOS_DEL_RESIDENTE } from '@/lib/rostro';

const CAMARA_NEGADA =
  'No se pudo abrir la cámara. Permita el acceso en el navegador o elija una foto.';
const SIN_CAMARA = 'Este navegador no puede abrir la cámara: elija una foto.';

const camaraDelNavegador = (): MediaDevices | null => {
  const n = globalThis.navigator as Navigator | undefined;
  return n?.mediaDevices !== undefined && typeof n.mediaDevices.getUserMedia === 'function'
    ? n.mediaDevices
    : null;
};

/**
 * 15-Y3 · la captura del rostro del residente, como en la app: la cámara
 * frontal (`getUserMedia`, `facingMode: 'user'`) o una foto del aparato; se
 * mide AQUÍ con los umbrales compartidos antes de que nada viaje; sin detector
 * de rostros, quien se fotografía confirma el encuadre. La imagen vive sólo en
 * memoria: ni almacenes, ni caché, ni bitácora. Sólo entrega una foto que sirve.
 */
export const CapturaDeRostro = ({
  alCambiar,
  titulo,
  indicacion,
  textoSiSirve = 'La foto sirve.',
  habilitada = true,
}: {
  readonly alCambiar: (foto: FotoLista | null) => void;
  readonly titulo: string;
  readonly indicacion: string;
  readonly textoSiSirve?: string;
  readonly habilitada?: boolean;
}): JSX.Element => {
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [leida, setLeida] = useState<CapturaLeida | null>(null);
  const [confirmaEncuadre, setConfirmaEncuadre] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const camara = camaraDelNavegador();

  const cerrarCamara = (): void => {
    flujo.current?.getTracks().forEach((pista) => pista.stop());
    flujo.current = null;
    setCamaraAbierta(false);
  };
  useEffect(() => cerrarCamara, []);

  // El `<video>` se monta DESPUÉS de abrir la cámara: el flujo se le conecta cuando ya existe.
  useEffect(() => {
    const v = video.current;
    const f = flujo.current;
    if (!camaraAbierta || v === null || f === null) return;
    v.srcObject = f;
    void v.play().catch(() => undefined);
  }, [camaraAbierta]);

  const abrirCamara = async (): Promise<void> => {
    if (camara === null) return;
    setAviso(null);
    try {
      flujo.current = await camara.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setCamaraAbierta(true);
    } catch {
      setAviso(CAMARA_NEGADA);
    }
  };

  /** Hasta que llegue el primer fotograma (o 3 s): capturar antes da una imagen vacía. */
  const primerFotograma = (v: HTMLVideoElement): Promise<void> =>
    v.readyState >= 2
      ? Promise.resolve()
      : new Promise((resolver) => {
          const listo = (): void => {
            v.removeEventListener('loadeddata', listo);
            resolver();
          };
          v.addEventListener('loadeddata', listo);
          setTimeout(listo, 3000);
        });

  const leer = async (fuente: ImageBitmapSource): Promise<void> => {
    setAviso(null);
    setProcesando(true);
    try {
      setLeida(await leerCaptura(fuente));
      setConfirmaEncuadre(false);
    } catch (fallo) {
      setLeida(null);
      setAviso(
        fallo instanceof ImagenDemasiadoGrande
          ? fallo.message
          : 'No se pudo leer la imagen. Use una foto JPEG o PNG.',
      );
    } finally {
      setProcesando(false);
    }
  };

  const tomarFoto = async (): Promise<void> => {
    const v = video.current;
    if (v === null) return;
    await primerFotograma(v);
    await leer(v);
    cerrarCamara();
  };

  const repetir = (): void => {
    setLeida(null);
    setConfirmaEncuadre(false);
    setAviso(null);
  };

  const medidas: MedidasDeCaptura | null =
    leida === null
      ? null
      : leida.detectorDisponible || !confirmaEncuadre
        ? leida.medidas
        : { ...leida.medidas, rostrosDetectados: 1, proporcionRostro: 0.4 };
  const fallos = medidas === null ? [] : fallosDeCalidad(medidas);
  const faltaConfirmar = leida !== null && !leida.detectorDisponible && !confirmaEncuadre;
  const consejos = faltaConfirmar
    ? fallos.filter((f) => f !== 'SIN_ROSTRO' && f !== 'DEMASIADO_LEJOS')
    : fallos;

  useEffect(() => {
    alCambiar(
      leida !== null && medidas !== null && fallos.length === 0
        ? { contenidoBase64: leida.base64, tipoMime: 'image/jpeg', medidas }
        : null,
    );
    // `medidas` y `fallos` se derivan de estas dos: basta con sus fuentes.
  }, [leida, confirmaEncuadre]);

  return (
    <section className="space-y-3" aria-labelledby="captura-del-rostro">
      <h2 id="captura-del-rostro" className="text-seccion text-texto">
        {titulo}
      </h2>
      <p className="text-secundario text-texto-apagado">{indicacion}</p>

      {camaraAbierta ? (
        <div className="space-y-2">
          {/* La vista previa es el flujo de la cámara: no se graba ni se guarda. */}
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            aria-label="Vista de la cámara"
            className="aspect-[3/4] w-full max-w-xs rounded-md border border-borde bg-oscuro object-cover"
          />
          <div className="flex flex-wrap gap-2">
            <Boton type="button" onClick={() => void tomarFoto()} disabled={!habilitada}>
              Tomar foto
            </Boton>
            <Boton type="button" variante="secundario" onClick={cerrarCamara}>
              Cerrar la cámara
            </Boton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {camara !== null ? (
            <Boton type="button" onClick={() => void abrirCamara()} disabled={!habilitada}>
              Abrir la cámara
            </Boton>
          ) : (
            <p className="text-secundario text-texto-apagado">{SIN_CAMARA}</p>
          )}
          <label className="inline-flex cursor-pointer items-center rounded-campo border border-borde px-3 py-2 text-secundario text-texto">
            Elegir una foto
            <input
              type="file"
              accept="image/jpeg,image/png"
              capture="user"
              aria-label="Elegir una foto"
              disabled={!habilitada}
              className="sr-only"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const fichero = e.target.files?.[0];
                if (fichero !== undefined) void leer(fichero);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}

      {procesando ? (
        <p role="status" className="text-secundario text-texto-apagado">
          Revisando la foto…
        </p>
      ) : null}

      {leida !== null ? (
        <div className="flex flex-wrap items-start gap-4">
          {/* `img` y no `next/image`: la fuente es un `data:` que sólo existe en esta pestaña. */}
          <img
            src={`data:image/jpeg;base64,${leida.base64}`}
            alt="Vista previa de su rostro"
            className="h-40 w-auto rounded-md border border-borde"
          />
          <div className="space-y-2">
            {fallos.length === 0 ? <Distintivo tono="exito">{textoSiSirve}</Distintivo> : null}
            <Boton type="button" variante="fantasma" tamano="sm" onClick={repetir}>
              Repetir
            </Boton>
          </div>
        </div>
      ) : null}

      {leida !== null && !leida.detectorDisponible ? (
        <label className="flex items-start gap-2 text-secundario">
          <input
            type="checkbox"
            checked={confirmaEncuadre}
            onChange={(e) => setConfirmaEncuadre(e.target.checked)}
          />
          <span>Encuadre correcto: sale UNA persona, de frente, cerca</span>
        </label>
      ) : null}

      {consejos.length > 0 ? (
        <ul className="space-y-1 text-secundario" role="alert">
          <li className="font-medium text-texto">
            {consejos.length === 1
              ? 'Repita la foto'
              : `Repita la foto: hay ${String(consejos.length)} cosas`}
          </li>
          {consejos.map((fallo) => (
            <li key={fallo}>· {CONSEJOS_DEL_RESIDENTE[fallo]}</li>
          ))}
        </ul>
      ) : null}

      {aviso !== null ? (
        <p className="text-secundario text-peligro-texto" role="alert">
          {aviso}
        </p>
      ) : null}
    </section>
  );
};
