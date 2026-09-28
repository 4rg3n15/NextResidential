'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { cliente, desenvolver } from '@/lib/api/cliente';

const CLAVE = ['plataforma', 'modo-pruebas'] as const;

/**
 * H5 (15-L) · EL INTERRUPTOR DEL MODO PRUEBAS. Sólo lo ve y lo cambia el
 * superadministrador (la API lo repite). Con él activo, las restricciones de
 * porteros —IP, bloqueo por intentos— se registran como «habría sido
 * rechazado» sin bloquear, y el límite de peticiones sube. Cada cambio queda
 * en la auditoría de seguridad y surte efecto sin reiniciar.
 */
export const InterruptorDeModoPruebas = (): JSX.Element => {
  const consultas = useQueryClient();
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const estado = useQuery({
    queryKey: CLAVE,
    queryFn: async () => desenvolver(await cliente.GET('/plataforma/modo-pruebas')).activo,
  });
  const cambiar = useMutation({
    mutationFn: async (activo: boolean) =>
      desenvolver(await cliente.PUT('/plataforma/modo-pruebas', { body: { activo } })).activo,
    onSuccess: async () => {
      setConfirmando(false);
      await consultas.invalidateQueries({ queryKey: CLAVE });
      // La franja de toda la consola se pinta en el servidor: se vuelve a pedir.
      router.refresh();
    },
  });

  if (!estado.isSuccess) {
    return <p className="text-secundario text-texto-apagado">Consultando el modo pruebas…</p>;
  }
  const activo = estado.data;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {activo ? (
          <Distintivo tono="aviso">Activo</Distintivo>
        ) : (
          <Distintivo tono="exito">Inactivo: restricciones aplicadas</Distintivo>
        )}
        {confirmando ? (
          <>
            <Boton
              tamano="sm"
              variante={activo ? 'primario' : 'peligro'}
              cargando={cambiar.isPending}
              onClick={() => cambiar.mutate(!activo)}
            >
              {activo ? 'Sí, aplicar las restricciones' : 'Sí, desactivar las restricciones'}
            </Boton>
            <Boton tamano="sm" variante="fantasma" onClick={() => setConfirmando(false)}>
              Cancelar
            </Boton>
          </>
        ) : (
          <Boton tamano="sm" variante="secundario" onClick={() => setConfirmando(true)}>
            {activo ? 'Desactivar modo pruebas' : 'Activar modo pruebas'}
          </Boton>
        )}
      </div>
      {cambiar.isError ? (
        <p role="alert" className="text-secundario text-peligro-texto">
          {cambiar.error.message}
        </p>
      ) : null}
    </div>
  );
};
