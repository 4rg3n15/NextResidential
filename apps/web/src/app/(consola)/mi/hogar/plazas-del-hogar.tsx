'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { cliente, desenvolver, mensajeDeFallo } from '@/lib/api/cliente';
import { clavesDelResidente, useMisOcupantes } from '@/lib/api/residente';
import type { MisOcupantes, PlazaDeOcupante } from '@/lib/api/residente';
import { textoDeCodigoDePlaza } from '@/lib/compartir';
import {
  AVISO_DEL_TOPE,
  MOTIVO_MINIMO_DE_RETIRO,
  SOLO_EL_TITULAR,
  alTope,
  cupoDePlazas,
  puedeAnadirPlaza,
  sePuedeRetirar,
} from '@/lib/hogar';
import { Aviso, estadoDeConsulta } from '../comunes';
import { BotonCompartir } from './boton-compartir';

const Plaza = ({
  plaza,
  vivienda,
  retirable,
  alRetirar,
  alAvisar,
}: {
  readonly plaza: PlazaDeOcupante;
  readonly vivienda: string;
  readonly retirable: boolean;
  readonly alRetirar: () => void;
  readonly alAvisar: (mensaje: string | null) => void;
}): JSX.Element => {
  const codigo = plaza.libre ? plaza.codigo : null;
  return (
    <li className="space-y-2 border-b border-borde-suave py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutro-suave text-distintivo font-bold text-neutro-texto"
        >
          {plaza.numero}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-cuerpo text-texto">
            {plaza.libre ? 'Plaza libre' : (plaza.ocupante ?? 'Ocupada')}
          </p>
          {plaza.sinCuenta ? (
            <p className="text-secundario text-texto-apagado">Menor de edad, sin cuenta</p>
          ) : null}
          {codigo !== null ? (
            <p className="text-secundario text-texto-apagado">
              Código: <span className="font-mono text-texto">{codigo}</span>
            </p>
          ) : null}
        </div>
        {plaza.sinCuenta ? <Distintivo tono="neutro">Sin cuenta</Distintivo> : null}
      </div>
      {codigo !== null || retirable ? (
        <div className="flex flex-wrap justify-end gap-2">
          {codigo !== null ? (
            <BotonCompartir
              texto={textoDeCodigoDePlaza(codigo, vivienda)}
              codigo={codigo}
              alResultado={alAvisar}
            />
          ) : null}
          {retirable ? (
            <Boton type="button" variante="fantasma" tamano="sm" onClick={alRetirar}>
              Retirar
            </Boton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
};

/**
 * 15-Y2 · las plazas del hogar en el Perfil, como «Ocupantes» en la app: el
 * cupo («3 de 4»), cada plaza libre con su código y «Compartir», el menor sin
 * cuenta marcado, y, sólo para el titular, «Añadir plaza» hasta el tope y
 * «Retirar» en las libres (nunca la 1, que es la suya), con motivo. Si el
 * titular no ha declarado cuántos viven, lo declara aquí; los demás esperan.
 * El tope y quién es el titular los dice el servidor en cada lectura.
 */
export const PlazasDelHogar = ({
  copropiedadId,
  vivienda,
}: {
  readonly copropiedadId: string;
  /** «Casa 42 · Manzana B», para el mensaje que se comparte. */
  readonly vivienda: string;
}): JSX.Element => {
  const consultas = useQueryClient();
  const ocupantes = useMisOcupantes(copropiedadId);
  const [aviso, setAviso] = useState<string | null>(null);
  const [numero, setNumero] = useState('');
  const [retiro, setRetiro] = useState<PlazaDeOcupante | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const o = ocupantes.data;
  const ruta = { params: { path: { id: copropiedadId } } };

  const terminar = async (r: MisOcupantes, mensaje: string): Promise<void> => {
    consultas.setQueryData([...clavesDelResidente.raiz(copropiedadId), 'ocupantes'], r);
    await consultas.invalidateQueries({ queryKey: clavesDelResidente.raiz(copropiedadId) });
    setAviso(mensaje);
  };

  const hacer = async (accion: () => Promise<void>): Promise<void> => {
    if (enviando) return;
    setEnviando(true);
    setError(undefined);
    setAviso(null);
    try {
      await accion();
    } catch (fallo) {
      setError(mensajeDeFallo(fallo));
    } finally {
      setEnviando(false);
    }
  };

  const declarar = (): Promise<void> =>
    hacer(async () => {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/mi/ocupantes', {
          ...ruta,
          body: { numero: Number(numero) },
        }),
      );
      await terminar(r, `Ocupantes declarados. Plazas: ${cupoDePlazas(r)}.`);
    });

  const anadir = (): Promise<void> =>
    hacer(async () => {
      const r = desenvolver(await cliente.POST('/copropiedades/{id}/mi/ocupantes/plazas', ruta));
      await terminar(r, `Plaza añadida. Plazas: ${cupoDePlazas(r)}.`);
    });

  const retirar = (motivo: string): Promise<void> =>
    hacer(async () => {
      if (retiro === null) return;
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/mi/ocupantes/plazas/{plazaId}/retiro', {
          params: { path: { id: copropiedadId, plazaId: retiro.id } },
          body: { motivo },
        }),
      );
      setRetiro(null);
      await terminar(r, `Plaza ${String(retiro.numero)} retirada.`);
    });

  const numeroValido =
    /^\d+$/.test(numero) && Number(numero) >= 1 && Number(numero) <= (o?.tope ?? 1);

  return (
    <Tarjeta>
      <CabeceraDeTarjeta
        titulo={o === undefined ? 'Plazas' : `Plazas: ${cupoDePlazas(o)}`}
        descripcion={
          o !== undefined && o.aviso.trim() !== ''
            ? o.aviso
            : 'Cada plaza libre tiene un código: con él, quien vive contigo crea su propia cuenta.'
        }
      />
      <CuerpoDeTarjeta className="space-y-3">
        {estadoDeConsulta(ocupantes, 'Cargando las plazas')}
        {o !== undefined && !o.declarada ? (
          o.esTitular ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (numeroValido) void declarar();
              }}
            >
              <Campo
                etiqueta="¿Cuántas personas viven en tu vivienda?"
                name="numero"
                type="number"
                inputMode="numeric"
                min={1}
                max={o.tope}
                required
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                ayuda={`Contándote a ti. Hasta ${String(o.tope)}; para más, la administración.`}
              />
              <Boton type="submit" disabled={!numeroValido || enviando} cargando={enviando}>
                Declarar
              </Boton>
            </form>
          ) : (
            <Aviso>El titular todavía no declaró cuántas personas viven en la vivienda.</Aviso>
          )
        ) : null}
        {o !== undefined && o.declarada ? (
          <>
            <ul aria-label="Plazas de ocupante">
              {o.plazas.map((plaza) => (
                <Plaza
                  key={plaza.id}
                  plaza={plaza}
                  vivienda={vivienda}
                  retirable={sePuedeRetirar(o, plaza) && !enviando}
                  alRetirar={() => setRetiro(plaza)}
                  alAvisar={setAviso}
                />
              ))}
            </ul>
            {o.esTitular ? (
              <div className="flex flex-wrap items-center gap-3">
                <Boton
                  type="button"
                  variante="secundario"
                  tamano="sm"
                  disabled={!puedeAnadirPlaza(o) || enviando}
                  onClick={() => void anadir()}
                >
                  Añadir plaza
                </Boton>
                {alTope(o) ? (
                  <span className="text-secundario text-texto-apagado">{AVISO_DEL_TOPE}</span>
                ) : null}
              </div>
            ) : (
              <p className="text-secundario text-texto-apagado">{SOLO_EL_TITULAR}</p>
            )}
          </>
        ) : null}
        {aviso !== null ? (
          <p role="status" className="text-secundario text-exito-texto">
            {aviso}
          </p>
        ) : null}
        {error !== undefined && retiro === null ? (
          <p role="alert" className="text-secundario text-peligro-texto">
            {error}
          </p>
        ) : null}
      </CuerpoDeTarjeta>
      <DialogoDeConfirmacion
        abierto={retiro !== null}
        titulo={retiro === null ? '' : `¿Retirar la plaza ${String(retiro.numero)}?`}
        descripcion="Su código deja de servir. Si la necesita otra vez, podrá añadir una plaza."
        etiquetaConfirmar="Retirar"
        minimoMotivo={MOTIVO_MINIMO_DE_RETIRO}
        enviando={enviando}
        error={retiro === null ? undefined : error}
        alConfirmar={(motivo) => void retirar(motivo)}
        alCancelar={() => {
          setRetiro(null);
          setError(undefined);
        }}
      />
    </Tarjeta>
  );
};
