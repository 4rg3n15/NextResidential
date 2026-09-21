/// M-5 · HU-19 · Zonas comunes con aforo y horario.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA INTERFAZ REFLEJA, NO CALCULA
///
/// Es la regla que gobierna la pantalla entera y conviene que esté escrita
/// donde se puede incumplir. El número de plazas que se pinta es el de **este
/// instante** y puede quedar obsoleto mientras el residente lo mira; quien
/// impide el ingreso número 21 sobre un aforo de 20 es la base de datos, con su
/// restricción, en el momento del ingreso (ADR-04).
///
/// Por eso aquí no hay ningún cálculo de si se puede entrar, ni un botón que lo
/// prometa. Hay un número, una barra y una hora. «Quedan 3 plazas» no es una
/// promesa, y la pantalla lo dice con todas las letras en vez de dejar que el
/// residente lo suponga.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// EL CRUCE DE MEDIANOCHE
///
/// Una franja que cruza medianoche llega como DOS —viernes 22:00–24:00 y sábado
/// 00:00–01:00 (S-09)—, y la segunda es la cola de la primera. La consecuencia
/// que el residente nota: a las 00:30 de un sábado la piscina figura ABIERTA y
/// el contador **no se ha reiniciado**, porque reiniciarlo a medianoche vaciaría
/// el aforo con gente dentro.
library;

import 'package:flutter/material.dart';

import '../../dominio/entidades.dart';
import '../controlador.dart';
import 'comunes.dart';
import '../widgets/estados.dart';

class PantallaDeZonas extends StatelessWidget {
  const PantallaDeZonas({
    super.key,
    required this.controlador,
    required this.alPedirAcceso,
  });

  final ControladorDeVista<List<ZonaComun>> controlador;
  final VoidCallback alPedirAcceso;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controlador,
      builder: (context, _) => SafeArea(
        child: VistaConEstado<List<ZonaComun>>(
          estado: controlador.estado,
          alReintentar: controlador.cargarAhora,
          alPedirAcceso: alPedirAcceso,
          mensajeVacio: 'Este conjunto todavía no tiene zonas comunes configuradas. '
              'Cuando la administración añada alguna, aparecerá aquí con su aforo.',
          conDatos: (zonas, {required desdeCache}) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (desdeCache) const MarcaDeCache(),
              Text('Zonas comunes', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const _AvisoDeReflejo(),
              const SizedBox(height: 12),
              for (final z in zonas) _TarjetaDeZona(zona: z),
            ],
          ),
        ),
      ),
    );
  }
}

/// El aviso que impide que el número se lea como una reserva.
class _AvisoDeReflejo extends StatelessWidget {
  const _AvisoDeReflejo();

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.info_outline, size: 18, color: t.colorScheme.outline),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            'El aforo que ve es el de este momento y puede cambiar. No reserva plaza: '
            'quien controla el cupo es la entrada de la zona.',
            style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline),
          ),
        ),
      ],
    );
  }
}

class _TarjetaDeZona extends StatelessWidget {
  const _TarjetaDeZona({required this.zona});
  final ZonaComun zona;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final relativa = zona.ocupacionRelativa;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(zona.nombre, style: t.textTheme.titleMedium)),
                _Estado(abierta: zona.abiertaAhora),
              ],
            ),
            const SizedBox(height: 12),

            if (relativa == null)
              Text('Sin límite de aforo', style: t.textTheme.bodyMedium)
            else ...[
              // La barra y el número dicen lo mismo: quien no distingue colores
              // tiene el texto, y quien lee deprisa tiene la barra (AA).
              Semantics(
                label: '${zona.ocupacionActual} de ${zona.aforoMaximo} plazas ocupadas',
                child: LinearProgressIndicator(
                  value: relativa,
                  minHeight: 8,
                  color: zona.lleno ? t.colorScheme.error : t.colorScheme.primary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                zona.lleno
                    // «-3 plazas» no significa nada para quien lo lee.
                    ? 'Lleno · ${zona.ocupacionActual} de ${zona.aforoMaximo}'
                    : 'Quedan ${zona.plazasLibres} de ${zona.aforoMaximo} plazas',
                style: t.textTheme.bodyMedium,
              ),
            ],

            const SizedBox(height: 12),
            _Horario(franjas: zona.franjasDeHoy),

            if (zona.requiereAutorizacion) ...[
              const SizedBox(height: 8),
              Text(
                'Sus visitantes necesitan que usted les autorice esta zona al registrarlos.',
                style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Estado extends StatelessWidget {
  const _Estado({required this.abierta});
  final bool abierta;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: abierta ? c.primaryContainer : c.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        abierta ? 'Abierta' : 'Cerrada',
        style: TextStyle(color: abierta ? c.onPrimaryContainer : c.onSurfaceVariant),
      ),
    );
  }
}

class _Horario extends StatelessWidget {
  const _Horario({required this.franjas});
  final List<FranjaDeZona> franjas;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    if (franjas.isEmpty) {
      return Text('Hoy no tiene horario configurado', style: t.textTheme.bodySmall);
    }
    return Text(
      'Hoy: ${franjas.map(_franja).join(' · ')}',
      style: t.textTheme.bodySmall,
    );
  }

  static String _franja(FranjaDeZona f) {
    final d = f.desde.toLocal();
    final h = f.hasta.toLocal();
    return '${_hm(d)}–${_hm(h)}';
  }

  static String _hm(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}
