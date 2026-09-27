'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { CodigoQr } from '@/componentes/codigo-qr';
import { Distintivo } from '@/componentes/ui/distintivo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';

/**
 * LO QUE PASA DESPUÉS DE CAPTURAR (A3, ETAPA 15-E).
 *
 * La captura deja el consentimiento PENDIENTE del titular. Esta tarjeta hace
 * las dos cosas que el operador necesita a continuación, y ninguna de las que
 * no debe:
 *
 *  1. **Emitir el enlace** con el que el TITULAR responde desde su propio
 *     teléfono. Se muestra para copiarlo y entregarlo; no se abre aquí.
 *  2. **Comprobar la respuesta y sincronizar** a todas las terminales con
 *     biblioteca de rostros. Si el titular todavía no aceptó, lo dice y no
 *     empuja nada (RN-09).
 *
 * Sigue sin haber un botón de «aceptar» del operador: el consentimiento no es
 * un trámite suyo (RN-10).
 *
 * D-10 · **el canal presencial**, para cuando el enlace no se puede abrir (en
 * sitio, H-SITIO-10). La pantalla se entrega al TITULAR: él escribe su nombre
 * y su documento —la consola no los conoce ni los precarga— y declara que
 * leyó la política. El servidor los compara con el padrón; la auditoría deja
 * el canal, el operador que atendía, la hora y la versión.
 */
interface Enlace {
  readonly url: string | null;
  readonly ruta: string;
  readonly expiraEn: string;
  /** H-SITIO-10 · si otro aparato puede abrir la URL. */
  readonly alcance?: 'ausente' | 'bucle_local' | 'alcanzable';
}

interface PorTerminal {
  readonly dispositivoId: string;
  readonly nombre: string;
  readonly sincronizada: boolean;
  readonly detalle: string;
}

interface Total {
  readonly terminales: number;
  readonly sincronizadas: number;
  readonly fallidas: number;
  readonly porTerminal: readonly PorTerminal[];
}

const mensajeDe = (fallo: unknown, porOmision: string): string =>
  fallo instanceof ErrorDeApi ? fallo.message : porOmision;

const TEXTO_DE_LA_POLITICA =
  'Se le pide autorización para registrar su rostro y usarlo únicamente para reconocerlo en ' +
  'los puntos de acceso de la copropiedad mientras dure su visita. La imagen se guarda ' +
  'cifrada, se envía sólo a los equipos de acceso y se elimina automáticamente al vencer su ' +
  'autorización, o antes si usted lo pide. Puede revocarlo en cualquier momento.';

/**
 * D-10 · el formulario que llena el TITULAR. Estado propio y efímero: al
 * enviarlo se vacía, para que el documento no quede en la pantalla del
 * siguiente que se acerque.
 */
const FormularioPresencial = ({
  versionPolitica,
  ocupado,
  alEnviar,
}: {
  readonly versionPolitica: string;
  readonly ocupado: boolean;
  readonly alEnviar: (datos: {
    nombreCompleto: string;
    numeroDocumento: string;
  }) => Promise<boolean>;
}): JSX.Element => {
  const [nombreCompleto, setNombre] = useState('');
  const [numeroDocumento, setDocumento] = useState('');
  const [declara, setDeclara] = useState(false);
  const listo = nombreCompleto.trim().length >= 2 && numeroDocumento.trim().length >= 4 && declara;
  return (
    <form
      aria-label="Consentimiento presencial del titular"
      className="space-y-2 rounded-md border border-aviso p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void alEnviar({ nombreCompleto, numeroDocumento }).then((enviado) => {
          if (!enviado) return;
          setNombre('');
          setDocumento('');
          setDeclara(false);
        });
      }}
    >
      <p className="font-medium">Para el titular: llénelo usted mismo.</p>
      <p className="text-muted-foreground">{TEXTO_DE_LA_POLITICA}</p>
      <p className="text-muted-foreground">
        Política de tratamiento de datos biométricos, versión <strong>{versionPolitica}</strong>{' '}
        (Ley 1581 de 2012).
      </p>
      <label className="block">
        <span>Su nombre completo</span>
        <input
          value={nombreCompleto}
          onChange={(e) => setNombre(e.target.value)}
          autoComplete="off"
          maxLength={200}
          className="mt-1 block w-full rounded-md border px-2 py-1"
        />
      </label>
      <label className="block">
        <span>Su número de documento</span>
        <input
          value={numeroDocumento}
          onChange={(e) => setDocumento(e.target.value)}
          autoComplete="off"
          maxLength={30}
          className="mt-1 block w-full rounded-md border px-2 py-1"
        />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={declara} onChange={(e) => setDeclara(e.target.checked)} />
        <span>
          Soy el titular de este rostro, leí la política {versionPolitica} y autorizo su uso para el
          control de acceso.
        </span>
      </label>
      <Boton type="submit" disabled={!listo || ocupado}>
        Registrar mi consentimiento
      </Boton>
    </form>
  );
};

export const SeguimientoDeConsentimiento = ({
  copropiedadId,
  consentimientoId,
  plantillaId,
  versionPolitica,
}: {
  readonly copropiedadId: string;
  readonly consentimientoId: string;
  readonly plantillaId: string;
  /** D-10 · la versión con la que se solicitó: la que el titular acepta. */
  readonly versionPolitica: string;
}): JSX.Element => {
  const [enlace, setEnlace] = useState<Enlace | null>(null);
  const [estado, setEstado] = useState<string>('pendiente');
  const [total, setTotal] = useState<Total | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [presencial, setPresencial] = useState(false);

  const aceptarPresencialmente = async (datos: {
    nombreCompleto: string;
    numeroDocumento: string;
  }): Promise<boolean> => {
    setOcupado(true);
    setError(undefined);
    try {
      const r = desenvolver(
        await cliente.POST(
          '/copropiedades/{id}/biometria/consentimientos/{consentimientoId}/aceptacion-presencial',
          {
            params: { path: { id: copropiedadId, consentimientoId } },
            body: { ...datos, versionPolitica, aceptaPolitica: true },
          },
        ),
      ) as { estado: string; propagacion: readonly Total[] };
      setEstado(r.estado);
      setTotal(r.propagacion[0] ?? null);
      setPresencial(false);
      return true;
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo registrar el consentimiento. Inténtelo de nuevo.'));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const emitirEnlace = async (): Promise<void> => {
    setOcupado(true);
    setError(undefined);
    try {
      const r = desenvolver(
        await cliente.POST(
          '/copropiedades/{id}/biometria/consentimientos/{consentimientoId}/enlace',
          { params: { path: { id: copropiedadId, consentimientoId } } },
        ),
      );
      setEnlace(r as Enlace);
      setCopiado(false);
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo emitir el enlace. Inténtelo de nuevo.'));
    } finally {
      setOcupado(false);
    }
  };

  const comprobarYSincronizar = async (): Promise<void> => {
    setOcupado(true);
    setError(undefined);
    setTotal(null);
    try {
      const c = desenvolver(
        await cliente.GET('/copropiedades/{id}/biometria/consentimientos/{consentimientoId}', {
          params: { path: { id: copropiedadId, consentimientoId } },
        }),
      ) as { estado: string };
      setEstado(c.estado);
      if (c.estado !== 'vigente') return;
      const r = desenvolver(
        await cliente.POST(
          '/copropiedades/{id}/biometria/plantillas/{plantillaId}/sincronizacion-total',
          {
            params: { path: { id: copropiedadId, plantillaId } },
          },
        ),
      );
      setTotal(r as Total);
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo comprobar el consentimiento. Inténtelo de nuevo.'));
    } finally {
      setOcupado(false);
    }
  };

  const textoDelEnlace = enlace === null ? '' : (enlace.url ?? enlace.ruta);

  const copiar = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(textoDelEnlace);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div className="space-y-4 rounded-md border p-4 text-sm" role="status">
      <p className="font-medium">
        Consentimiento solicitado · {estado === 'pendiente' ? 'pendiente del titular' : estado}
      </p>
      <p className="text-muted-foreground">
        La plantilla queda retenida hasta que el titular acepte. Entréguele el enlace: lo abre en su
        teléfono, sin cuenta, y responde él. Nadie responde por él (RN-10).
      </p>

      <div className="flex flex-wrap gap-2">
        <Boton variante="secundario" onClick={() => void emitirEnlace()} disabled={ocupado}>
          {enlace === null ? 'Generar enlace para el titular' : 'Generar otro enlace'}
        </Boton>
        <Boton
          variante="secundario"
          onClick={() => void comprobarYSincronizar()}
          disabled={ocupado}
        >
          Comprobar respuesta y sincronizar a todas las terminales
        </Boton>
        {estado === 'pendiente' && (
          <Boton
            variante="secundario"
            onClick={() => setPresencial((abierto) => !abierto)}
            disabled={ocupado}
          >
            {presencial
              ? 'Cerrar el consentimiento presencial'
              : 'El titular está aquí: consentimiento presencial'}
          </Boton>
        )}
      </div>

      {presencial && estado === 'pendiente' && (
        <FormularioPresencial
          versionPolitica={versionPolitica}
          ocupado={ocupado}
          alEnviar={aceptarPresencialmente}
        />
      )}

      {enlace !== null && (
        <div className="space-y-2">
          <label className="block">
            <span className="text-muted-foreground">Enlace del titular</span>
            <input
              readOnly
              value={textoDelEnlace}
              aria-label="Enlace del titular"
              className="mt-1 block w-full rounded-md border bg-muted px-2 py-1 font-mono text-xs"
            />
          </label>
          {enlace.alcance === 'bucle_local' && (
            <p
              role="alert"
              className="rounded-md border border-peligro px-2 py-1 text-peligro-texto"
            >
              Este enlace NO se abre desde otro aparato: apunta a 127.0.0.1 / localhost, que en el
              teléfono del visitante es el propio teléfono. Declare en la API{' '}
              <code>API_URL_PUBLICA=http://&lt;IP-del-Mac&gt;:3000</code> y genere otro enlace, o
              use el consentimiento presencial en esta pantalla.
            </p>
          )}
          {enlace.url !== null && (
            <div className="flex flex-wrap items-start gap-3">
              <CodigoQr texto={enlace.url} titulo="Código QR del enlace del titular" />
              <p className="max-w-xs text-muted-foreground">
                Muéstrele el QR al titular: lo lee con la cámara de su teléfono y responde ahí. El
                enlace es de un solo uso y caduca; para revocar después hará falta otro.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Boton variante="secundario" onClick={() => void copiar()}>
              {copiado ? 'Copiado' : 'Copiar'}
            </Boton>
            <span className="text-muted-foreground">
              Caduca el {new Date(enlace.expiraEn).toLocaleString('es-CO')}.
            </span>
          </div>
          {enlace.url === null && (
            <p className="text-muted-foreground">
              Sólo se muestra la ruta porque la API no declara <code>API_URL_PUBLICA</code>.
              Antepóngale la dirección con la que el teléfono del visitante alcanza la API (en
              sitio, <code>http://&lt;IP-del-Mac&gt;:3000</code>).
            </p>
          )}
        </div>
      )}

      {estado !== 'pendiente' && estado !== 'vigente' && (
        <p>
          <Distintivo tono="aviso">Cerrado</Distintivo> El titular respondió «{estado}»: no se
          sincroniza nada.
        </p>
      )}

      {total !== null && (
        <div className="space-y-1">
          <p>
            <Distintivo tono={total.fallidas === 0 ? 'exito' : 'aviso'}>
              {total.sincronizadas} de {total.terminales}
            </Distintivo>{' '}
            {total.terminales === 0
              ? 'Ningún equipo activo declara biblioteca de rostros: sondee la terminal desde su ficha.'
              : 'equipos con biblioteca de rostros tienen la plantilla.'}
          </p>
          <ul className="space-y-1">
            {total.porTerminal.map((t) => (
              <li key={t.dispositivoId} className="flex items-start gap-2">
                <Distintivo tono={t.sincronizada ? 'exito' : 'peligro'}>
                  {t.sincronizada ? 'Sincronizada' : 'Falló'}
                </Distintivo>
                <span>
                  {t.nombre} · {t.detalle}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error !== undefined && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
