/// Lo que comparten «Nuevo visitante» y «Volver a autorizar» (15-L, F1 y F6):
/// cuándo y cuánto, la casilla y cómo se cuenta lo que contestó el conjunto.
///
/// Las dos pantallas preguntan lo mismo sobre el CUÁNDO y enseñan lo mismo al
/// terminar. Si cada una tuviera su copia, la segunda acabaría con otra lista
/// de duraciones o con otro texto en la casilla — y la casilla, precisamente,
/// no puede decir dos cosas distintas.
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/casilla_de_la_foto.dart';
import '../../dominio/entidades.dart';
import '../pantallas/comunes.dart';

/// Las duraciones que se ofrecen, las mismas que en la consola. El servidor
/// admite de 15 minutos a 24 horas; la lista se queda dentro.
const duracionesDeVisita = <(int, String)>[
  (30, '30 minutos'),
  (60, '1 hora'),
  (120, '2 horas'),
  (240, '4 horas'),
  (480, '8 horas'),
  (720, '12 horas'),
  (1440, '24 horas'),
];

/// La de la consola: dos horas cubren la visita corriente sin dejar la puerta
/// abierta toda la tarde. [SUPUESTO] S-88.
const duracionPorOmision = 120;

/// El instante con que se abre el formulario: ahora, en la hora del teléfono y
/// sin segundos. Es lo corriente —el visitante suele estar ya en la puerta— y
/// se cambia con dos toques si viene otro día.
DateTime alMinuto(DateTime d) {
  final l = d.toLocal();
  return DateTime(l.year, l.month, l.day, l.hour, l.minute);
}

/// C5 (15-M) · una sola función de fecha en toda la app: `fechaCorta`.
String fechaLegible(DateTime d) => fechaCorta(d);
String horaLegible(DateTime d) => horaCorta(d);

/// Fecha, hora y duración. Sin estado propio: el formulario tiene el valor.
class CuandoYCuantoDura extends StatelessWidget {
  const CuandoYCuantoDura({
    super.key,
    required this.inicio,
    required this.duracionMinutos,
    required this.hoy,
    required this.alCambiarInicio,
    required this.alCambiarDuracion,
    this.habilitado = true,
  });

  final DateTime inicio;
  final int duracionMinutos;

  /// El primer día elegible. Una visita de ayer no autoriza a nadie.
  final DateTime hoy;
  final ValueChanged<DateTime> alCambiarInicio;
  final ValueChanged<int> alCambiarDuracion;
  final bool habilitado;

  DateTime get _hasta => inicio.add(Duration(minutes: duracionMinutos));

  Future<void> _elegirFecha(BuildContext context) async {
    final primero = DateTime(hoy.year, hoy.month, hoy.day);
    final fecha = await showDatePicker(
      context: context,
      initialDate: inicio.isBefore(primero) ? primero : inicio,
      firstDate: primero,
      lastDate: primero.add(const Duration(days: 365)),
      // C5 (15-M) · el selector habla español de Colombia: días, meses y
      // orden día-mes-año como el resto de la app.
      locale: const Locale('es', 'CO'),
    );
    if (fecha == null) return;
    alCambiarInicio(DateTime(fecha.year, fecha.month, fecha.day, inicio.hour, inicio.minute));
  }

  Future<void> _elegirHora(BuildContext context) async {
    final hora = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(inicio),
    );
    if (hora == null) return;
    alCambiarInicio(DateTime(inicio.year, inicio.month, inicio.day, hora.hour, hora.minute));
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ListTile(
          key: const Key('visita.fecha'),
          contentPadding: EdgeInsets.zero,
          enabled: habilitado,
          title: const Text('Fecha'),
          subtitle: Text(fechaLegible(inicio)),
          trailing: const Icon(Icons.event),
          onTap: () => _elegirFecha(context),
        ),
        ListTile(
          key: const Key('visita.hora'),
          contentPadding: EdgeInsets.zero,
          enabled: habilitado,
          title: const Text('Hora'),
          subtitle: Text(horaLegible(inicio)),
          trailing: const Icon(Icons.schedule),
          onTap: () => _elegirHora(context),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<int>(
          key: const Key('visita.duracion'),
          initialValue: duracionMinutos,
          decoration: const InputDecoration(labelText: 'Duración'),
          items: [
            for (final (minutos, etiqueta) in duracionesDeVisita)
              DropdownMenuItem(value: minutos, child: Text(etiqueta)),
          ],
          onChanged: habilitado
              ? (v) {
                  if (v != null) alCambiarDuracion(v);
                }
              : null,
        ),
        const SizedBox(height: 8),
        Text(
          'Podrá entrar hasta el ${momentoLegible(_hasta)}.',
          style: const TextStyle(color: Paleta.textoSuave, fontSize: 13),
        ),
      ],
    );
  }
}

/// F4 · la casilla, con su texto EXACTO. Es la ÚNICA constancia de que el
/// visitante autorizó el uso de su foto: la marca el residente, y el servidor
/// guarda quién la marcó, cuándo y con qué versión del texto.
class CasillaDeLaFoto extends StatelessWidget {
  const CasillaDeLaFoto({
    super.key,
    required this.nombreDelVisitante,
    required this.marcada,
    required this.alCambiar,
    this.habilitada = true,
  });

  /// El nombre tal como está en el formulario, en vivo: la frase se reescribe
  /// con cada letra. El dominio quita los bordes y cubre el campo vacío.
  final String nombreDelVisitante;
  final bool marcada;
  final ValueChanged<bool> alCambiar;
  final bool habilitada;

  @override
  Widget build(BuildContext context) {
    return CheckboxListTile(
      key: const Key('visita.casilla'),
      contentPadding: EdgeInsets.zero,
      controlAffinity: ListTileControlAffinity.leading,
      value: marcada,
      onChanged: habilitada ? (v) => alCambiar(v ?? false) : null,
      title: Text(textoDeLaCasilla(nombreDelVisitante)),
      subtitle: const Text(
        'Márquela sólo si el visitante se lo autorizó. Queda registrado quién la marcó y '
        'cuándo, y la foto se borra de los equipos cuando termina la visita.',
        style: TextStyle(fontSize: 12),
      ),
    );
  }
}

/// Lo que contestó el conjunto, dicho para que el residente sepa qué hacer.
class DesenlaceDeVisita extends StatelessWidget {
  const DesenlaceDeVisita({super.key, required this.resultado, required this.alCerrar});
  final ResultadoDeVisita resultado;
  final VoidCallback alCerrar;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return switch (resultado) {
      VisitaCreada(repetida: true) => RecuadroDeVisita(
          icono: Icons.check_circle_outline,
          color: c.primary,
          titulo: 'Esta visita ya estaba registrada',
          // Decir «creada» dos veces sería mentir: el servidor devolvió la
          // anterior, no creó otra (RN-17).
          cuerpo: 'Se había enviado antes y el conjunto la conservó. No se creó una segunda.',
          alCerrar: alCerrar,
        ),
      final VisitaCreada v => RecuadroDeVisita(
          icono: Icons.check_circle_outline,
          color: c.primary,
          titulo: 'Visita autorizada',
          cuerpo: [
            'La portería ya puede verla.',
            // C9 (15-M) · la placa, confirmada con nombre y las dos fechas,
            // con las palabras que manda el servidor.
            if (v.confirmacionDePlaca != null && v.confirmacionDePlaca!.isNotEmpty)
              '${v.confirmacionDePlaca!}.',
            _enLosEquipos(v),
            if (v.avisoDeSincronizacion != null) v.avisoDeSincronizacion!,
          ].join(' '),
          alCerrar: alCerrar,
        ),
      VisitaRechazada(motivo: final m, explicacion: final e) => RecuadroDeVisita(
          icono: m.salida == SalidaDelRechazo.hableConLaAdministracion
              ? Icons.info_outline
              : Icons.edit_outlined,
          color: c.error,
          titulo: switch (m.salida) {
            // La diferencia que el residente NECESITA: una la resuelve la
            // administración y la otra la resuelve él, aquí mismo.
            SalidaDelRechazo.hableConLaAdministracion => 'No se pudo registrar',
            SalidaDelRechazo.corrijaElFormulario => 'Corrija un dato y vuelva a intentar',
          },
          cuerpo: e,
          alCerrar: alCerrar,
        ),
      final FotoRechazada f => RecuadroDeVisita(
          icono: Icons.no_photography_outlined,
          color: c.error,
          titulo: 'El conjunto no aceptó la foto',
          // Nunca el código: «NITIDEZ» no le dice a nadie qué hacer con el
          // teléfono; «la foto está borrosa», sí.
          cuerpo: 'La foto no sirve: ${f.razones.join('; ')}. Tome otra foto o elija otra de '
              'la galería y vuelva a registrar la visita.',
          alCerrar: alCerrar,
        ),
    };
  }

  /// F3 · dónde quedó la foto, con números y no con un «listo». Sin equipos
  /// con rostros, la redacción es [SUPUESTO] S-89.
  static String _enLosEquipos(VisitaCreada v) {
    if (v.equipos == 0) {
      return 'Por ahora ningún equipo del conjunto reconoce rostros: el visitante se '
          'anuncia en la portería.';
    }
    final equipos = v.equipos == 1 ? 'equipo' : 'equipos';
    final fallidas = v.fallidas == 0
        ? ''
        : ' ${v.fallidas} no ${v.fallidas == 1 ? 'la aceptó' : 'la aceptaron'}.';
    return 'La foto quedó en ${v.sincronizadas} de ${v.equipos} $equipos.$fallidas';
  }
}

/// Sin red. La visita quedó guardada con su clave y se reintentará sola.
class AvisoDeVisitaEncolada extends StatelessWidget {
  const AvisoDeVisitaEncolada({super.key, required this.alCerrar});
  final VoidCallback alCerrar;

  @override
  Widget build(BuildContext context) => RecuadroDeVisita(
        icono: Icons.cloud_off_outlined,
        color: Theme.of(context).colorScheme.tertiary,
        titulo: 'Quedó pendiente de enviarse',
        // No se dice «autorizada». No lo está, y prometerlo haría que el
        // residente mandara a su visitante a una puerta que no se abrirá.
        cuerpo: 'No hay conexión ahora. La app la enviará sola en cuanto vuelva, y no la '
            'duplicará aunque lo intente varias veces. Todavía no está autorizada.',
        alCerrar: alCerrar,
      );
}

/// El servidor no pudo atender la petición (sin permiso, datos que no admite,
/// una visita que no es de su vivienda). Se enseña su motivo, tal cual.
class AvisoDeVisitaFallida extends StatelessWidget {
  const AvisoDeVisitaFallida({super.key, required this.detalle, required this.alCerrar});
  final String detalle;
  final VoidCallback alCerrar;

  @override
  Widget build(BuildContext context) => RecuadroDeVisita(
        icono: Icons.error_outline,
        color: Theme.of(context).colorScheme.error,
        titulo: 'No se pudo enviar',
        cuerpo: detalle,
        alCerrar: alCerrar,
      );
}

class RecuadroDeVisita extends StatelessWidget {
  const RecuadroDeVisita({
    super.key,
    required this.icono,
    required this.color,
    required this.titulo,
    required this.cuerpo,
    required this.alCerrar,
  });

  final IconData icono;
  final Color color;
  final String titulo;
  final String cuerpo;
  final VoidCallback alCerrar;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
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
                ],
              ),
            ),
            IconButton(onPressed: alCerrar, icon: const Icon(Icons.close), tooltip: 'Cerrar aviso'),
          ],
        ),
      ),
    );
  }
}
