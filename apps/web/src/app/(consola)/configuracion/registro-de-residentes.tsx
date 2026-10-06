'use client';

import type { JSX } from 'react';
import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CampoDeMotivo, motivoParaEnviar, motivoValido } from '@/componentes/campo-de-motivo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { Boton } from '@/componentes/ui/boton';
import { cliente, desenvolver, mensajeDeFallo } from '@/lib/api/cliente';
import { RECARGA_DE_LISTAS_COMPARTIDAS } from '@/lib/api/recarga';
import { fechaYHora } from '@/lib/fechas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * «CREAR CUENTA» SUSPENDIDO POR INTENTOS · RONDA 15-W
 *
 * En la app, quien no es titular hace «Crear cuenta» con el código de la
 * copropiedad y un código de plaza. Demasiados códigos incorrectos en una hora
 * suspenden el registro de TODA la copropiedad durante una hora: es la defensa
 * contra quien prueba códigos al azar. Mientras dura, nadie del conjunto puede
 * crear su cuenta, y el superadministrador tiene que enterarse aquí y no por la
 * llamada de un residente.
 *
 * Por eso el aviso aparece SÓLO con `suspendido: true` —uno permanente se deja
 * de leer— y dice hasta cuándo. Reanudar antes de la hora exige motivo; la API
 * lo guarda en la bitácora y en la auditoría de seguridad, y la pantalla lo
 * dice antes de pedirlo. El umbral de intentos no se escribe aquí: es del
 * servidor, y una cifra copiada en la consola se quedaría atrás el día que
 * cambie.
 *
 * Sin caché y con relectura periódica: la suspensión la provocan otros, desde
 * la app, en cualquier momento. El diálogo vive FUERA del aviso para que un 409
 * («El registro no está suspendido») se pueda leer aunque, al volver a
 * preguntar, el aviso desaparezca.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const claveDelRegistro = (copropiedadId: string) =>
  ['residentes', copropiedadId, 'registro'] as const;

const fallosEnTexto = (n: number): string =>
  n === 1 ? '1 código de plaza incorrecto' : `${String(n)} códigos de plaza incorrectos`;

export const AvisoDeRegistroSuspendido = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consultas = useQueryClient();
  const idTitulo = useId();
  const estado = useQuery({
    queryKey: claveDelRegistro(copropiedadId),
    gcTime: 0,
    ...RECARGA_DE_LISTAS_COMPARTIDAS,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/residentes/registro', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });
  const [reanudando, setReanudando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const abrir = (): void => {
    setMotivo('');
    setError(undefined);
    setReanudando(true);
  };

  const reanudar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/residentes/registro/reanudacion', {
          params: { path: { id: copropiedadId } },
          body: { motivo: motivoParaEnviar(motivo) },
        }),
      );
      setReanudando(false);
      setAviso('«Crear cuenta» se reanudó. Quedó en la auditoría con tu nombre y el motivo.');
    } catch (e) {
      setError(mensajeDeFallo(e));
    } finally {
      setEnviando(false);
      // Con éxito o con 409, lo que se ve ya no es cierto: se vuelve a preguntar.
      void consultas.invalidateQueries({ queryKey: claveDelRegistro(copropiedadId) });
    }
  };

  let contenido: JSX.Element | null = null;
  if (estado.isPending) {
    contenido = (
      <p role="status" className="text-secundario text-texto-apagado">
        Consultando si «Crear cuenta» está suspendido…
      </p>
    );
  } else if (estado.isError) {
    contenido = (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 text-secundario text-peligro-texto"
      >
        <span>
          No se pudo consultar si «Crear cuenta» está suspendido. {mensajeDeFallo(estado.error)}
        </span>
        <Boton variante="secundario" tamano="sm" onClick={() => void estado.refetch()}>
          Reintentar
        </Boton>
      </div>
    );
  } else if (estado.data.suspendido) {
    const { hasta, fallosRecientes } = estado.data;
    contenido = (
      <section
        aria-labelledby={idTitulo}
        className="space-y-3 rounded-tarjeta border border-aviso bg-aviso-suave p-4"
      >
        <div role="alert" className="space-y-1">
          <h2 id={idTitulo} className="text-seccion text-aviso-texto">
            Registro suspendido por intentos
          </h2>
          <p className="text-cuerpo text-texto">
            Nadie de esta copropiedad puede usar «Crear cuenta» en la app{' '}
            {hasta === null ? 'durante una hora' : `hasta el ${fechaYHora(hasta)}`}: se escribieron
            demasiados códigos de plaza incorrectos ({fallosEnTexto(fallosRecientes)} en la última
            hora). Al terminar, se reanuda sin que nadie haga nada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Boton variante="secundario" tamano="sm" onClick={abrir}>
            Reanudar
          </Boton>
          <p className="text-secundario text-texto-apagado">
            Reanudar antes exige un motivo, y queda en la auditoría con tu nombre.
          </p>
        </div>
      </section>
    );
  } else if (aviso !== null) {
    contenido = (
      <p role="status" className="text-secundario text-exito-texto">
        {aviso}
      </p>
    );
  } else if (estado.data.fallosRecientes > 0) {
    contenido = (
      <p className="text-secundario text-texto-apagado">
        «Crear cuenta» en la app: {fallosEnTexto(estado.data.fallosRecientes)} en la última hora.
      </p>
    );
  }

  return (
    <>
      {/* El margen sólo con contenido: sin nada que decir, no deja un hueco arriba. */}
      {contenido === null ? null : <div className="mb-4">{contenido}</div>}
      <DialogoDeFormulario
        abierto={reanudando}
        titulo="Reanudar «Crear cuenta»"
        descripcion="Los residentes vuelven a poder crear su cuenta con un código de plaza sin esperar a que termine la hora. Queda en la bitácora y en la auditoría de seguridad con tu nombre, la hora y el motivo."
        etiquetaEnviar="Reanudar ahora"
        enviando={enviando}
        error={error}
        puedeEnviar={motivoValido(motivo)}
        alEnviar={() => void reanudar()}
        alCancelar={() => setReanudando(false)}
      >
        <CampoDeMotivo valor={motivo} cambiar={setMotivo} />
      </DialogoDeFormulario>
    </>
  );
};
