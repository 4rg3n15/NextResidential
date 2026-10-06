/// Las filas de visitas: lo que el conjunto tiene y lo que espera en el teléfono.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA SITUACIÓN ES LA DEL SERVIDOR (15-L)
///
/// «Vigente», «Programada», «Vencida» o «Rechazada» salen tal cual de la API,
/// que las deriva con su reloj: es lo mismo que ve la consola. Si portería
/// rechaza una visita, la tarjeta lo dice con el motivo que escribió, en la
/// siguiente recarga, sin que el residente toque nada.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LO PENDIENTE SE VE, Y NO SE CONFUNDE CON LO CONFIRMADO
///
/// Una visita creada sin red espera en el teléfono con la marca «Pendiente de
/// envío» hasta que el conjunto la recibe. No está autorizada, y la fila no
/// puede parecerse a una que sí.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// «REVOCAR» SÓLO DONDE TIENE SENTIDO (15-W)
///
/// Una visita vigente o programada se puede revocar, con motivo. Una vencida o
/// ya rechazada no ofrece el botón: el servidor la rechazaría igual, y un botón
/// que siempre falla enseña a no creer en los botones.
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/bandeja_de_salida.dart';
import '../../dominio/entidades.dart';
import '../../dominio/revocacion.dart';
import '../pantallas/comunes.dart';

String etiquetaDeSituacion(SituacionDeVisita s) => switch (s) {
  SituacionDeVisita.vigente => 'Vigente',
  SituacionDeVisita.programada => 'Programada',
  SituacionDeVisita.vencida => 'Vencida',
  SituacionDeVisita.rechazada => 'Rechazada',
  SituacionDeVisita.desconocida => 'Sin estado',
};

class DistintivoDeSituacion extends StatelessWidget {
  const DistintivoDeSituacion(this.situacion, {super.key});
  final SituacionDeVisita situacion;

  @override
  Widget build(BuildContext context) => Distintivo(
    texto: etiquetaDeSituacion(situacion),
    pareja: switch (situacion) {
      SituacionDeVisita.vigente => Paleta.exitoSuave,
      SituacionDeVisita.programada => Paleta.avisoSuave,
      SituacionDeVisita.rechazada => Paleta.peligroSuave,
      SituacionDeVisita.vencida || SituacionDeVisita.desconocida => Paleta.neutroSuave,
    },
  );
}

class FilaDeAutorizacion extends StatelessWidget {
  const FilaDeAutorizacion(this.a, {super.key, this.conHasta = true, this.alRevocar});
  final Autorizacion a;

  /// Inicio enseña la fila corta; la pestaña, hasta cuándo vale.
  final bool conHasta;

  /// 15-W · `null` = sin revocación (Inicio, las pruebas de antes).
  final void Function(Autorizacion visita)? alRevocar;

  @override
  Widget build(BuildContext context) {
    final motivo = a.motivoRechazo?.trim();
    final rechazada = a.situacion == SituacionDeVisita.rechazada;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(
          a.permiteAccesoVehicular ? Icons.directions_car_outlined : Icons.how_to_reg_outlined,
        ),
        title: Text(a.visitante),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              [
                a.tipo,
                if (a.placa != null) a.placa!,
                if (a.acompanantes > 0) '${a.acompanantes} acompañante(s)',
                if (conHasta) 'hasta ${momentoLegible(a.hasta)}',
              ].join(' · '),
            ),
            // C9 (15-M) · la placa, confirmada con las DOS fechas.
            if (a.placa != null)
              Text(
                confirmacionDePlaca(
                  placa: a.placa,
                  visitante: a.visitante,
                  desde: a.desde,
                  hasta: a.hasta,
                ),
              ),
            // El motivo lo escribió quien la rechazó; es lo que el residente
            // necesita para saber qué pasó sin llamar a portería.
            if (rechazada && motivo != null && motivo.isNotEmpty)
              Text(
                'Motivo: $motivo',
                style: TextStyle(color: Paleta.peligroSuave.texto, fontWeight: FontWeight.w600),
              ),
            if (alRevocar != null && sePuedeRevocar(a))
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  key: Key('visita.revocar.${a.id}'),
                  onPressed: () => alRevocar!(a),
                  child: const Text('Revocar'),
                ),
              ),
          ],
        ),
        trailing: DistintivoDeSituacion(a.situacion),
      ),
    );
  }
}

/// Lo que espera en el teléfono: la explicación, cada visita con su marca, y
/// el botón para intentarlo ya.
class BandejaDeVisitas extends StatelessWidget {
  const BandejaDeVisitas({super.key, required this.pendientes, required this.alReintentar});

  final List<EnvioPendiente> pendientes;
  final Future<void> Function() alReintentar;

  @override
  Widget build(BuildContext context) {
    final texto = Paleta.avisoSuave.texto;
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
              Icon(Icons.cloud_upload_outlined, size: 18, color: texto),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${pendientes.length} sin enviar',
                  style: TextStyle(color: texto, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Estas visitas se guardaron en el teléfono y se enviarán solas cuando vuelva la '
            'conexión, aunque cierre la app. Todavía NO están autorizadas: el portero no las verá.',
            style: TextStyle(color: texto, fontSize: 12),
          ),
          const SizedBox(height: 8),
          ...pendientes.map(FilaPendiente.new),
          TextButton.icon(
            onPressed: alReintentar,
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Intentar ahora'),
          ),
          Text(
            'Reintentar no duplica: si la visita ya se había creado, se conserva la misma.',
            style: TextStyle(color: texto, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class FilaPendiente extends StatelessWidget {
  const FilaPendiente(this.p, {super.key});
  final EnvioPendiente p;

  @override
  Widget build(BuildContext context) {
    final visitante = p.cuerpo['visitante'];
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const Icon(Icons.schedule_send_outlined),
        title: Text(visitante is String ? visitante : 'Visita'),
        subtitle: Text(
          [
            'guardada ${momentoLegible(p.encoladoEn)}',
            if (p.intentos > 0) '${p.intentos} intento(s)',
          ].join(' · '),
        ),
        trailing: Distintivo(texto: 'Pendiente de envío', pareja: Paleta.avisoSuave),
      ),
    );
  }
}
