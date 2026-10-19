'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CapturaDeRostro } from '@/componentes/captura-de-rostro';
import type { FotoLista } from '@/componentes/captura-de-foto';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { MOTIVOS_DE_FOTO } from '../../visitantes/generar-autorizacion';
import { clavesDelResidente, useRostro } from '@/lib/api/residente';
import { textosDelRostro, tieneRostro } from '@/lib/rostro';
import { estadoDeConsulta } from '../comunes';
import { PoliticaDelRostro } from './politica-del-rostro';
import { TarjetaDelEstado } from './tarjeta-del-estado';

const SIN_CONEXION =
  'Sin conexión: su foto no se guardó en este aparato. Tómela de nuevo cuando tenga conexión.';

interface Aviso {
  readonly texto: string;
  readonly bien: boolean;
}

/**
 * D-72 · el mensaje del rechazo CON sus motivos.
 *
 * Visto en sitio el 19/10: la pantalla enseñaba «La foto no sirve para
 * reconocer el rostro» y nada más, mientras la API estaba devolviendo en el
 * mismo 400 cuál de las medidas había fallado. La persona repetía la foto a
 * ciegas sin saber si el problema era la luz, el encuadre, la nitidez o que
 * salía más de un rostro. «Generar autorización» y «Visitas» ya los enseñan
 * con este mismo diccionario; esta pantalla era la que faltaba.
 */
export const conMotivosDeFoto = (fallo: ErrorDeApi): string => {
  const motivos = fallo.motivosDeFoto ?? [];
  if (motivos.length === 0) return fallo.message;
  const porque = motivos.map((m) => MOTIVOS_DE_FOTO[m] ?? m).join(', ');
  return `${fallo.message}: ${porque}.`;
};

/**
 * 15-Y3 · «Mi rostro» (y «Rostro de <menor>», ADR-039), como la pantalla de
 * la app: el estado con sus equipos, la captura medida en este aparato, la
 * política con su casilla —y las dos declaraciones del representante—,
 * registrar o renovar, y retirar. Una política NUEVA no se da por aceptada:
 * si la versión cambia, las casillas se desmarcan. La imagen vive sólo en
 * memoria y se descarta al registrarla, al perder la conexión y al salir.
 */
export const PantallaDeRostro = ({
  copropiedadId,
  menor,
}: {
  readonly copropiedadId: string;
  /** `null` es el propio; con un menor, el suyo (sólo el titular, de 15 a 17). */
  readonly menor: { readonly residenteId: string; readonly nombre: string } | null;
}): JSX.Element => {
  const consultas = useQueryClient();
  const rostro = useRostro(copropiedadId, menor?.residenteId ?? null);
  const textos = textosDelRostro(menor?.nombre ?? null);
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [declarado, setDeclarado] = useState<readonly boolean[]>(
    textos.declaraciones.map(() => false),
  );
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [retirando, setRetirando] = useState(false);
  // Cambia para montar una captura nueva: así una foto descartada no se queda en pantalla ni en memoria.
  const [intento, setIntento] = useState(0);
  const version = rostro.data?.politica.version;

  useEffect(() => {
    // Una política nueva no se da por aceptada: la casilla era para otro texto.
    setAcepta(false);
    setDeclarado(textos.declaraciones.map(() => false));
    // `textos` depende sólo de `menor`, que no cambia en la vida de la pantalla.
  }, [version]);

  const e = rostro.data;
  const listo = foto !== null && acepta && declarado.every(Boolean);

  const descartarFoto = (): void => {
    setFoto(null);
    setIntento((n) => n + 1);
  };

  const refrescar = async (): Promise<void> => {
    await consultas.invalidateQueries({ queryKey: clavesDelResidente.raiz(copropiedadId) });
  };

  const registrar = async (): Promise<void> => {
    if (e === undefined || foto === null || !listo) return;
    setOcupado(true);
    setAviso(null);
    const cuerpo = { ...foto, versionPolitica: e.politica.version, aceptaPolitica: true };
    try {
      desenvolver(
        menor === null
          ? await cliente.POST('/copropiedades/{id}/mi/rostro', {
              params: { path: { id: copropiedadId } },
              body: cuerpo,
            })
          : await cliente.POST('/copropiedades/{id}/mi/menores/{residenteId}/rostro', {
              params: { path: { id: copropiedadId, residenteId: menor.residenteId } },
              body: { ...cuerpo, declaraRepresentacionLegal: true, menorInformadoYDeAcuerdo: true },
            }),
      );
      descartarFoto();
      setAviso({ texto: 'Listo: su rostro quedó registrado.', bien: true });
      await refrescar();
    } catch (fallo) {
      if (!(fallo instanceof ErrorDeApi)) {
        descartarFoto();
        setAviso({ texto: SIN_CONEXION, bien: false });
        return;
      }
      // D-72 · con los motivos, que dicen CUÁL de las medidas falló. Sin
      // ellos, «la foto no sirve» deja a la persona probando a ciegas.
      setAviso({ texto: conMotivosDeFoto(fallo), bien: false });
      // 15-Z2 · por el código: la política que cambió desmarca la casilla en el acto y se relee.
      if (fallo.causa === 'POLITICA_CAMBIADA') {
        setAcepta(false);
        setDeclarado(textos.declaraciones.map(() => false));
      }
      if (fallo.causa !== undefined || fallo.estado >= 500) await refrescar();
    } finally {
      setOcupado(false);
    }
  };

  const retirar = async (): Promise<void> => {
    setOcupado(true);
    setAviso(null);
    try {
      desenvolver(
        menor === null
          ? await cliente.POST('/copropiedades/{id}/mi/rostro/retiro', {
              params: { path: { id: copropiedadId } },
            })
          : await cliente.POST('/copropiedades/{id}/mi/menores/{residenteId}/rostro/retiro', {
              params: { path: { id: copropiedadId, residenteId: menor.residenteId } },
            }),
      );
      setRetirando(false);
      setAviso({ texto: 'Su rostro se retiró.', bien: true });
      await refrescar();
    } catch (fallo) {
      setAviso({
        texto: fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.',
        bien: false,
      });
      setRetirando(false);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo={textos.titulo}
        descripcion="Con su rostro registrado, la terminal de la portería lo reconoce y le abre. Es opcional."
      />
      {estadoDeConsulta(rostro, 'Cargando tu rostro')}
      {e !== undefined ? (
        <>
          <TarjetaDelEstado estado={e} />
          {aviso !== null ? (
            <p
              role={aviso.bien ? 'status' : 'alert'}
              className={
                aviso.bien
                  ? 'rounded-md bg-exito-suave px-3 py-2 text-secundario text-exito-texto'
                  : 'rounded-md bg-peligro-suave px-3 py-2 text-secundario text-peligro-texto'
              }
            >
              {aviso.texto}
            </p>
          ) : null}
          <CapturaDeRostro
            key={intento}
            alCambiar={setFoto}
            habilitada={!ocupado}
            titulo={tieneRostro(e.estado) ? textos.renovar : textos.registrar}
            indicacion="De frente, con buena luz y sin nadie más en la imagen: es la foto con la que la terminal de la portería lo reconocerá."
          />
          <PoliticaDelRostro
            politica={e.politica}
            textos={textos}
            acepta={acepta}
            declarado={declarado}
            deshabilitada={ocupado}
            alAceptar={setAcepta}
            alDeclarar={(i, v) => setDeclarado((d) => d.map((x, j) => (j === i ? v : x)))}
          />
          <div className="flex flex-wrap gap-2">
            <Boton
              type="button"
              disabled={!listo || ocupado}
              cargando={ocupado && !retirando}
              onClick={() => void registrar()}
            >
              {tieneRostro(e.estado) ? textos.renovar : textos.registrar}
            </Boton>
            {tieneRostro(e.estado) ? (
              <Boton
                type="button"
                variante="peligro"
                disabled={ocupado}
                onClick={() => setRetirando(true)}
              >
                {textos.retirar}
              </Boton>
            ) : null}
          </div>
        </>
      ) : null}
      <DialogoDeConfirmacion
        abierto={retirando}
        titulo="¿Retirar su rostro?"
        descripcion="Se borra de inmediato, también de los equipos de la portería. Podrá registrarlo de nuevo cuando quiera."
        etiquetaConfirmar="Retirar"
        sinMotivo
        enviando={ocupado}
        alConfirmar={() => void retirar()}
        alCancelar={() => setRetirando(false)}
      />
    </div>
  );
};
