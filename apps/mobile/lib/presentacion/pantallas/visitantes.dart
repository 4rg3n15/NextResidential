/// M-4 · la pestaña de visitantes: lo autorizado, lo pendiente y el botón.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// POR QUÉ LA BANDEJA SE VE AQUÍ Y NO EN UN AJUSTE
///
/// Cuando no hay red, la visita se encola. Si eso no se viera, el residente
/// tendría una lista de autorizaciones en la que su visitante NO aparece y un
/// mensaje que ya cerró: creería que se perdió y la volvería a crear. Con una
/// clave de idempotencia nueva, esa segunda sería una visita distinta de verdad.
///
/// Por eso lo pendiente vive junto a lo confirmado, separado y rotulado: son dos
/// cosas distintas y la pantalla no las mezcla en una sola lista donde pareciera
/// que ya están.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LO QUE SE RINDIÓ TAMPOCO SE ESCONDE
///
/// Tras ocho intentos la bandeja deja de reintentar sola. No se borra: se enseña
/// con su último error y un botón. El reintento a mano repite la MISMA clave, así
/// que sigue sin poder duplicar (RN-17).
///
/// ═════════════════════════════════════════════════════════════════════════════
/// F6 · LOS ÚLTIMOS VISITANTES, CON «VOLVER A AUTORIZAR»
///
/// Uno por persona y el más reciente primero. Quien viene cada semana se
/// autoriza con dos toques: cuándo, cuánto y la casilla. Es una lectura aparte
/// de la de las autorizaciones y se pinta aparte: si fallara, la lista de lo
/// autorizado sigue a la vista, que es lo que importa en la puerta.
library;

import 'package:flutter/material.dart';

import '../../aplicacion/estado.dart';
import '../../dominio/bandeja_de_salida.dart';
import '../../dominio/entidades.dart';
import '../../configuracion/tema.dart';
import '../controlador.dart';
import '../widgets/estados.dart';
import 'comunes.dart';

class PantallaDeVisitantes extends StatelessWidget {
  const PantallaDeVisitantes({
    super.key,
    required this.controlador,
    required this.ultimos,
    required this.alPedirAcceso,
    required this.alCrear,
    required this.alVolverAAutorizar,
    required this.pendientes,
    required this.alReintentarPendientes,
    required this.ahora,
  });

  final ControladorDeVista<List<Autorizacion>> controlador;

  /// F6 · los últimos visitantes, uno por persona.
  final ControladorDeVista<List<VisitanteReciente>> ultimos;
  final VoidCallback alPedirAcceso;
  final VoidCallback alCrear;
  final void Function(VisitanteReciente visitante) alVolverAAutorizar;

  /// Lo que espera en la bandeja. Se recibe ya resuelto: esta pantalla no sabe
  /// reintentar, solo lo enseña.
  final List<EnvioPendiente> pendientes;
  final Future<void> Function() alReintentarPendientes;
  final DateTime ahora;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: AnimatedBuilder(
          animation: Listenable.merge([controlador, ultimos]),
          builder: (context, _) => VistaConEstado<List<Autorizacion>>(
            // «Vacía» no es un estado aparte en esta pestaña: la bandeja y los
            // últimos visitantes tienen que verse aunque hoy no haya nada
            // autorizado, que es justo cuando más se vuelve a autorizar.
            estado: switch (controlador.estado) {
              Vacio<List<Autorizacion>>() => const ConDatos<List<Autorizacion>>([]),
              final e => e,
            },
            alReintentar: controlador.cargarAhora,
            alPedirAcceso: alPedirAcceso,
            conDatos: (lista, {required bool desdeCache}) => ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
              children: [
                Text('Mis visitantes', style: Theme.of(context).textTheme.headlineSmall),
                if (desdeCache) ...[const SizedBox(height: 8), const MarcaDeCache()],
                if (pendientes.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _Bandeja(
                    pendientes: pendientes,
                    ahora: ahora,
                    alReintentar: alReintentarPendientes,
                  ),
                ],
                _UltimosVisitantes(
                  estado: ultimos.estado,
                  alReintentar: ultimos.cargarAhora,
                  alVolverAAutorizar: alVolverAAutorizar,
                ),
                const SizedBox(height: 16),
                Text('Autorizaciones', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                const Text(
                  'Lo que el conjunto ya tiene registrado a su nombre.',
                  style: TextStyle(color: Paleta.textoSuave, fontSize: 13),
                ),
                const SizedBox(height: 8),
                if (lista.isEmpty)
                  const Text(
                    'Todavía no ha autorizado a ningún visitante.',
                    style: TextStyle(color: Paleta.textoSuave),
                  ),
                ...lista.map((a) => _Fila(a, ahora: ahora)),
              ],
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: alCrear,
        icon: const Icon(Icons.person_add_alt),
        label: const Text('Nuevo visitante'),
      ),
    );
  }
}

class _Bandeja extends StatelessWidget {
  const _Bandeja({
    required this.pendientes,
    required this.ahora,
    required this.alReintentar,
  });

  final List<EnvioPendiente> pendientes;
  final DateTime ahora;
  final Future<void> Function() alReintentar;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Paleta.avisoSuave.fondo,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.cloud_upload_outlined, size: 18, color: Paleta.avisoSuave.texto),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${pendientes.length} sin enviar',
                  style: TextStyle(
                    color: Paleta.avisoSuave.texto,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Estas visitas se guardaron en el teléfono y se enviarán solas cuando vuelva la '
            'conexión. Todavía NO están autorizadas: el portero no las verá.',
            style: TextStyle(color: Paleta.avisoSuave.texto, fontSize: 12),
          ),
          const SizedBox(height: 8),
          ...pendientes.map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '· ${p.cuerpo['visitante'] ?? 'Visita'} — encolada ${momentoLegible(p.encoladoEn)}'
                '${p.intentos > 0 ? ' · ${p.intentos} intento(s)' : ''}'
                '${p.ultimoError == null ? '' : ' · ${p.ultimoError}'}',
                style: TextStyle(color: Paleta.avisoSuave.texto, fontSize: 12),
              ),
            ),
          ),
          const SizedBox(height: 4),
          TextButton.icon(
            onPressed: alReintentar,
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Intentar ahora'),
          ),
          Text(
            'Reintentar no duplica: si la visita ya se había creado, se conserva la misma.',
            style: TextStyle(color: Paleta.avisoSuave.texto, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _Fila extends StatelessWidget {
  const _Fila(this.a, {required this.ahora});
  final Autorizacion a;
  final DateTime ahora;

  @override
  Widget build(BuildContext context) {
    final vigente = a.vigenteEn(ahora);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(
          a.permiteAccesoVehicular ? Icons.directions_car_outlined : Icons.how_to_reg_outlined,
        ),
        title: Text(a.visitante),
        subtitle: Text(
          [
            a.tipo,
            if (a.placa != null) a.placa!,
            if (a.acompanantes > 0) '${a.acompanantes} acompañante(s)',
            'hasta ${momentoLegible(a.hasta)}',
          ].join(' · '),
        ),
        trailing: Distintivo(
          texto: vigente ? 'vigente' : a.estado,
          pareja: vigente ? Paleta.exitoSuave : Paleta.neutroSuave,
        ),
      ),
    );
  }
}

/// F6 · la sección de los últimos visitantes. Pinta su propio estado sin
/// tapar el resto: vacía no ocupa sitio, y si falla lo dice en una línea.
class _UltimosVisitantes extends StatelessWidget {
  const _UltimosVisitantes({
    required this.estado,
    required this.alReintentar,
    required this.alVolverAAutorizar,
  });

  final Estado<List<VisitanteReciente>> estado;
  final Future<void> Function() alReintentar;
  final void Function(VisitanteReciente visitante) alVolverAAutorizar;

  @override
  Widget build(BuildContext context) {
    final (lista, fallo) = switch (estado) {
      ConDatos(datos: final d) => (d, null),
      Cargando(previo: final p) => (p, null),
      Fallido(fallo: final f, previo: final p) => (p, f),
      _ => (null, null),
    };
    if ((lista == null || lista.isEmpty) && fallo == null) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 16),
        Text('Últimos visitantes', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        const Text(
          'Para quien vuelve: se usan de nuevo sus datos y su foto.',
          style: TextStyle(color: Paleta.textoSuave, fontSize: 13),
        ),
        if (fallo != null)
          Row(
            children: [
              Expanded(
                child: Text(
                  'No se pudieron cargar sus últimos visitantes.',
                  style: TextStyle(color: Paleta.peligroSuave.texto, fontSize: 13),
                ),
              ),
              TextButton(onPressed: alReintentar, child: const Text('Reintentar')),
            ],
          ),
        const SizedBox(height: 8),
        ...?lista?.map((v) => _Reciente(v, alVolverAAutorizar: () => alVolverAAutorizar(v))),
      ],
    );
  }
}

class _Reciente extends StatelessWidget {
  const _Reciente(this.v, {required this.alVolverAAutorizar});
  final VisitanteReciente v;
  final VoidCallback alVolverAAutorizar;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(v.visitante, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 2),
            Text(
              [
                'Documento ${v.documento}',
                if (v.placa != null) v.placa!,
                'última visita ${momentoLegible(v.ultimaVisita)}',
              ].join(' · '),
              style: const TextStyle(color: Paleta.textoSuave, fontSize: 13),
            ),
            if (!v.tieneFoto)
              // Se dice ANTES de pulsar: sin foto guardada no hay nada que
              // copiar, y el servidor contestaría lo mismo tras el viaje.
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text(
                  'No hay una foto guardada: regístrelo como visitante nuevo.',
                  style: TextStyle(fontSize: 12),
                ),
              ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: v.tieneFoto ? alVolverAAutorizar : null,
                icon: const Icon(Icons.replay, size: 18),
                label: const Text('Volver a autorizar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
