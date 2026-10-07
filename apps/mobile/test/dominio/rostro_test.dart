/// 15-X (D2) · «Mi rostro» en el dominio de la app: el paso del primer
/// ingreso que lo ofrece y lo que se le dice al residente de su rostro.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/rostro.dart';

EstadoDeMiRostro estado(EstadoDelRostro e, {int equipos = 2, int conMiRostro = 0, int? dias}) =>
    EstadoDeMiRostro(
      estado: e,
      calidad: null,
      registradoEn: null,
      venceEn: null,
      diasParaVencer: dias,
      equiposConRostro: equipos,
      equiposConMiRostro: conMiRostro,
      equipos: const [],
    );

void main() {
  group('el primer ingreso ofrece el rostro', () {
    PasoDePrimerIngreso paso({bool ocupantes = false, bool ofrecer = true}) => pasoDePrimerIngreso(
      debeCambiarContrasena: false,
      viviendaVinculada: true,
      debeDeclararOcupantes: ocupantes,
      ofrecerRostro: ofrecer,
    );

    test('recién dado de alta: antes de la app, el rostro', () {
      expect(paso(), PasoDePrimerIngreso.ofrecerRostro);
    });

    test('sin ofrecerlo (ya respondió, o ya estaba dado de alta): la app', () {
      expect(paso(ofrecer: false), PasoDePrimerIngreso.listo);
    });

    test('los ocupantes del titular van primero: el rostro es lo último', () {
      expect(paso(ocupantes: true), PasoDePrimerIngreso.declararOcupantes);
    });

    test('ni la contraseña pendiente ni el alta se saltan por ofrecer el rostro', () {
      expect(
        pasoDePrimerIngreso(
          debeCambiarContrasena: true,
          viviendaVinculada: true,
          debeDeclararOcupantes: false,
          ofrecerRostro: true,
        ),
        PasoDePrimerIngreso.cambiarContrasena,
      );
      expect(
        pasoDePrimerIngreso(
          debeCambiarContrasena: false,
          viviendaVinculada: false,
          debeDeclararOcupantes: false,
          ofrecerRostro: true,
        ),
        PasoDePrimerIngreso.completarAlta,
      );
    });
  });

  group('el estado del rostro', () {
    test('un valor desconocido es «pendiente», nunca «activa»', () {
      expect(EstadoDelRostro.de('lo_que_venga_manana'), EstadoDelRostro.pendiente);
      expect(EstadoDelRostro.de('activa'), EstadoDelRostro.activa);
      expect(EstadoDelRostro.de('por_vencer'), EstadoDelRostro.porVencer);
    });

    test('hay rostro salvo sin rostro o retirándose', () {
      expect(estado(EstadoDelRostro.sinRostro).tieneRostro, isFalse);
      expect(estado(EstadoDelRostro.enRetiro).tieneRostro, isFalse);
      for (final e in [
        EstadoDelRostro.pendiente,
        EstadoDelRostro.activa,
        EstadoDelRostro.parcial,
        EstadoDelRostro.porVencer,
      ]) {
        expect(estado(e).tieneRostro, isTrue, reason: e.valor);
      }
    });

    test('sin rostro dice que es opcional', () {
      expect(textoDelEstado(estado(EstadoDelRostro.sinRostro)), contains('opcional'));
    });

    test('pendiente distingue «se está enviando» de «no hay equipos»', () {
      expect(textoDelEstado(estado(EstadoDelRostro.pendiente)), contains('enviando'));
      expect(
        textoDelEstado(estado(EstadoDelRostro.pendiente, equipos: 0)),
        contains('todavía no tiene equipos'),
      );
    });

    test('parcial y activa cuentan los equipos', () {
      expect(
        textoDelEstado(estado(EstadoDelRostro.parcial, equipos: 3, conMiRostro: 1)),
        contains('1 de 3'),
      );
      expect(textoDelEstado(estado(EstadoDelRostro.activa, equipos: 1)), contains('el equipo de la portería'));
      expect(textoDelEstado(estado(EstadoDelRostro.activa, equipos: 2)), contains('los 2'));
    });

    test('por vencer: hoy, mañana o en N días, siempre con «renuévelo»', () {
      expect(textoDelEstado(estado(EstadoDelRostro.porVencer, dias: 0)), contains('hoy'));
      expect(textoDelEstado(estado(EstadoDelRostro.porVencer, dias: 1)), contains('mañana'));
      final quince = textoDelEstado(estado(EstadoDelRostro.porVencer, dias: 15));
      expect(quince, contains('15 días'));
      expect(quince, contains('renuévelo'));
    });

    test('cada equipo, en palabras', () {
      expect(textoDelEquipo(EstadoEnEquipo.sincronizada), 'Lo reconoce');
      expect(textoDelEquipo(EstadoEnEquipo.pendiente), 'Pendiente');
      expect(textoDelEquipo(EstadoEnEquipo.fallida), contains('No lo recibió'));
    });

    test('conPolitica conserva el estado y cambia sólo la política', () {
      const p = PoliticaDelRostro(version: 'v', texto: 't');
      final con = estado(EstadoDelRostro.activa, conMiRostro: 2).conPolitica(p);
      expect(con.politica, same(p));
      expect(con.estado, EstadoDelRostro.activa);
      expect(con.equiposConMiRostro, 2);
    });
  });
}
