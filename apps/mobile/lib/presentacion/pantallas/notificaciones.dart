/// M-7 · HU-34 · Notificaciones, y el registro del aparato.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO
///
/// Que las notificaciones estén «activadas» en la app no significa que lleguen.
/// Hacen falta tres cosas y las tres pueden fallar por separado: el permiso del
/// sistema, un token del servicio de mensajería, y que ese token esté
/// **registrado en el conjunto**. Una pantalla que las resumiera en un
/// interruptor dejaría al residente creyendo que le avisarán cuando llegue su
/// visitante, y no le avisarían.
///
/// Por eso aquí hay tres estados visibles, no uno. Es el mismo criterio que el
/// resto de la app: decir lo que pasa en vez de un aspa o un visto.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// EL TOKEN ROTA SOLO
///
/// Caduca, cambia al reinstalar, cambia al restaurar una copia de seguridad. Por
/// eso el registro se reintenta al abrir la app y no solo cuando el residente
/// entra aquí, y por eso el servidor identifica el aparato por su
/// `instalacionId` y no por el token: si la fila se identificara por el token,
/// cada rotación dejaría un registro huérfano al que se seguiría notificando.
library;

import 'package:flutter/material.dart';

/// En qué punto de los tres está el aparato.
enum EstadoDeAvisos {
  /// Todavía no se ha preguntado nada.
  sinDeterminar,

  /// El residente dijo que no al permiso del sistema. NO es un error.
  permisoNegado,

  /// Hay permiso, pero no hay token: el servicio de mensajería no respondió.
  sinToken,

  /// Hay token y el conjunto lo tiene registrado.
  registrado,

  /// Hay token y el registro en el servidor falló.
  sinRegistrar,
}

/// Una línea para el resumen del Perfil. Vive AQUÍ, junto a los estados, para
/// que el resumen y el detalle no puedan decir cosas distintas: si se escribiera
/// en `perfil.dart`, añadir un estado dejaría el resumen mintiendo y nada lo
/// notaría.
String resumenDeAvisos(EstadoDeAvisos estado) => switch (estado) {
      EstadoDeAvisos.sinDeterminar => 'Sin activar',
      EstadoDeAvisos.permisoNegado => 'El teléfono no da permiso',
      EstadoDeAvisos.sinToken => 'Activadas, pero sin canal de aviso',
      EstadoDeAvisos.registrado => 'Activas en este teléfono',
      EstadoDeAvisos.sinRegistrar => 'Activadas, pero el conjunto no lo sabe',
    };

class PantallaDeNotificaciones extends StatelessWidget {
  const PantallaDeNotificaciones({
    super.key,
    required this.estado,
    required this.alActivar,
    required this.alReintentar,
    this.ultimoRegistro,
    this.detalleDelFallo,
  });

  final EstadoDeAvisos estado;
  final Future<void> Function() alActivar;
  final Future<void> Function() alReintentar;
  final DateTime? ultimoRegistro;
  final String? detalleDelFallo;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Notificaciones')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Le avisamos cuando su visitante llega a la portería, cuando se le niega el '
            'acceso a alguien que usted autorizó y cuando la administración publica una alerta.',
            style: t.textTheme.bodyMedium,
          ),
          const SizedBox(height: 24),
          _Tarjeta(estado: estado, detalle: detalleDelFallo, ultimoRegistro: ultimoRegistro),
          const SizedBox(height: 16),
          switch (estado) {
            EstadoDeAvisos.sinDeterminar => FilledButton.icon(
                onPressed: alActivar,
                icon: const Icon(Icons.notifications_active_outlined),
                label: const Text('Activar notificaciones'),
              ),
            EstadoDeAvisos.permisoNegado => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // No se puede reabrir el diálogo del sistema una vez negado:
                  // ofrecer un botón que «vuelva a pedir» sería mentir.
                  Text(
                    'El permiso se concede desde los ajustes del teléfono, en la ficha de esta '
                    'aplicación. La app no puede volver a preguntarlo.',
                    style: t.textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: alReintentar,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Ya lo concedí, comprobar'),
                  ),
                ],
              ),
            EstadoDeAvisos.sinToken ||
            EstadoDeAvisos.sinRegistrar =>
              FilledButton.icon(
                onPressed: alReintentar,
                icon: const Icon(Icons.refresh),
                label: const Text('Reintentar'),
              ),
            EstadoDeAvisos.registrado => OutlinedButton.icon(
                onPressed: alReintentar,
                icon: const Icon(Icons.refresh),
                label: const Text('Comprobar de nuevo'),
              ),
          },
        ],
      ),
    );
  }
}

class _Tarjeta extends StatelessWidget {
  const _Tarjeta({required this.estado, this.detalle, this.ultimoRegistro});
  final EstadoDeAvisos estado;
  final String? detalle;
  final DateTime? ultimoRegistro;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final (icono, color, titulo, cuerpo) = switch (estado) {
      EstadoDeAvisos.sinDeterminar => (
          Icons.notifications_none,
          c.outline,
          'Sin activar',
          'Todavía no ha activado las notificaciones en este aparato.',
        ),
      EstadoDeAvisos.permisoNegado => (
          Icons.notifications_off_outlined,
          c.error,
          'El teléfono no lo permite',
          'Usted negó el permiso de notificaciones. Sin él no podemos avisarle de nada.',
        ),
      EstadoDeAvisos.sinToken => (
          Icons.cloud_off_outlined,
          c.error,
          'El servicio de avisos no respondió',
          'Hay permiso, pero el teléfono no obtuvo su identificador de avisos. '
              'Suele arreglarse con conexión a internet y volviendo a intentar.',
        ),
      EstadoDeAvisos.sinRegistrar => (
          Icons.sync_problem_outlined,
          c.error,
          'Este aparato no está registrado en el conjunto',
          // El caso más engañoso: el teléfono está listo y aun así no llegan.
          'El teléfono está listo, pero el conjunto todavía no lo tiene apuntado, '
              'así que los avisos NO llegarán a este aparato.',
        ),
      EstadoDeAvisos.registrado => (
          Icons.notifications_active_outlined,
          c.primary,
          'Activas en este aparato',
          'El conjunto tiene apuntado este teléfono y le avisará.',
        ),
    };

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icono, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titulo, style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 4),
                Text(cuerpo),
                if (detalle != null) ...[
                  const SizedBox(height: 8),
                  Text(detalle!, style: Theme.of(context).textTheme.bodySmall),
                ],
                if (ultimoRegistro != null && estado == EstadoDeAvisos.registrado) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Última comprobación: ${_hm(ultimoRegistro!)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _hm(DateTime d) {
    final l = d.toLocal();
    return '${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')}';
  }
}
