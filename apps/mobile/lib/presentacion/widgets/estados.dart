/// Los cinco estados, dibujados UNA vez.
///
/// `VistaConEstado` recibe un `Estado<T>` y el `switch` sellado obliga a cubrir
/// las seis ramas. Una pantalla nueva no puede «olvidar» el estado sin conexión
/// porque no hay forma de pintar datos sin pasar por aquí.
///
/// Cada rama dice **qué pasó y qué hacer**, que es la diferencia entre un error
/// y un mensaje de error útil:
///
/// | Estado           | Qué se ofrece                                             |
/// | ---------------- | --------------------------------------------------------- |
/// | sin conexión     | Reintentar, y lo último bueno si lo había                  |
/// | sesión inválida  | Entrar otra vez — reintentar no lo arregla                 |
/// | sin permiso      | El motivo. Ni reintento ni botón que no lleva a nada       |
/// | sin vivienda     | La explicación de M-1: a quién pedirle el vínculo          |
/// | servidor         | La causa y reintentar                                      |
/// | vacío            | Que está vacío, no que falló                               |
library;

import 'package:flutter/material.dart';

import '../../aplicacion/estado.dart';
import '../../configuracion/tema.dart';
import '../../dominio/puertos.dart';

class VistaConEstado<T> extends StatelessWidget {
  const VistaConEstado({
    super.key,
    required this.estado,
    required this.conDatos,
    required this.alReintentar,
    required this.alPedirAcceso,
    this.mensajeVacio = 'Todavía no hay nada que mostrar.',
    this.esqueleto,
  });

  final Estado<T> estado;
  final Widget Function(T datos, {required bool desdeCache}) conDatos;
  final Future<void> Function() alReintentar;
  final void Function() alPedirAcceso;
  final String mensajeVacio;
  final Widget? esqueleto;

  @override
  Widget build(BuildContext context) {
    return switch (estado) {
      Inicial<T>() => esqueleto ?? const _Esqueleto(),
      // Recargar NO vacía la pantalla: si hay algo previo se sigue viendo con
      // el indicador encima. Lo contrario produce un parpadeo a blanco en cada
      // regreso a primer plano, que es cuando más se recarga.
      Cargando<T>(previo: final previo) => previo == null
          ? (esqueleto ?? const _Esqueleto())
          : Stack(
              children: [
                conDatos(previo, desdeCache: true),
                const Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(minHeight: 2),
                ),
              ],
            ),
      Vacio<T>() => _Aviso(
          icono: Icons.inbox_outlined,
          titulo: 'Sin datos',
          detalle: mensajeVacio,
          pareja: Paleta.neutroSuave,
        ),
      ConDatos<T>(datos: final datos, desdeCache: final cache) =>
        conDatos(datos, desdeCache: cache),
      Fallido<T>(fallo: final fallo, previo: final previo) =>
        _fallo(context, fallo, previo),
    };
  }

  Widget _fallo(BuildContext context, Fallo fallo, T? previo) {
    final (titulo, pareja, icono, accion) = switch (fallo.clase) {
      ClaseDeFallo.sinConexion => (
          'Sin conexión',
          Paleta.avisoSuave,
          Icons.wifi_off_outlined,
          _Accion('Reintentar', alReintentar),
        ),
      ClaseDeFallo.sesionInvalida => (
          'La sesión expiró',
          Paleta.avisoSuave,
          Icons.lock_clock_outlined,
          _Accion('Entrar otra vez', () async => alPedirAcceso()),
        ),
      ClaseDeFallo.sinPermiso => (
          'Sin permiso',
          Paleta.peligroSuave,
          Icons.block_outlined,
          null,
        ),
      ClaseDeFallo.sinVivienda => (
          'Sin vivienda asignada',
          Paleta.neutroSuave,
          Icons.home_outlined,
          null,
        ),
      ClaseDeFallo.servidor => (
          'No se pudo cargar',
          Paleta.peligroSuave,
          Icons.error_outline,
          _Accion('Reintentar', alReintentar),
        ),
    };

    final aviso = _Aviso(
      icono: icono,
      titulo: titulo,
      detalle: fallo.detalle,
      pareja: pareja,
      accion: accion,
    );
    if (previo == null) return aviso;
    // Con dato previo, el fallo va ARRIBA y el dato viejo debajo, marcado. Un
    // fallo que borra lo que ya se veía es peor que un fallo anunciado.
    return Column(
      children: [aviso, Expanded(child: conDatos(previo, desdeCache: true))],
    );
  }
}

class _Accion {
  const _Accion(this.etiqueta, this.alPulsar);
  final String etiqueta;
  final Future<void> Function() alPulsar;
}

class _Aviso extends StatelessWidget {
  const _Aviso({
    required this.icono,
    required this.titulo,
    required this.detalle,
    required this.pareja,
    this.accion,
  });

  final IconData icono;
  final String titulo;
  final String detalle;
  final Pareja pareja;
  final _Accion? accion;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: pareja.fondo,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icono, color: pareja.texto, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    titulo,
                    style: TextStyle(
                      color: pareja.texto,
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(detalle, style: TextStyle(color: pareja.texto, fontSize: 14)),
            if (accion != null) ...[
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => accion!.alPulsar(),
                child: Text(accion!.etiqueta),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Esqueleto, no bloqueo: el contrato lo pide así (§6, ETAPA 09). Un spinner a
/// pantalla completa no dice cuánto viene ni deja ver la forma de lo que llega.
class _Esqueleto extends StatelessWidget {
  const _Esqueleto();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: 4,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, _) => Container(
        height: 72,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Paleta.borde),
        ),
      ),
    );
  }
}
