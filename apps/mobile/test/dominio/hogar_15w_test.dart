import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/edad.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/menores.dart';
import 'package:ncr_residente/dominio/revocacion.dart';

/// RONDA 15-W · las reglas puras del hogar: el cupo de plazas, qué se puede
/// retirar, el texto que se comparte, los menores, el vehículo eliminado, la
/// visita revocada y los motivos del primer ingreso.
void main() {
  const titular = PlazaDeOcupante(
    id: 'p1',
    numero: 1,
    libre: false,
    codigo: null,
    ocupante: 'Ana Pérez',
  );
  const libre = PlazaDeOcupante(
    id: 'p2',
    numero: 2,
    libre: true,
    codigo: 'MIRA-ABCD-EFGH',
    ocupante: null,
  );
  const menor = PlazaDeOcupante(
    id: 'p3',
    numero: 3,
    libre: false,
    codigo: null,
    ocupante: 'Sofía Pérez',
    sinCuenta: true,
  );

  MisOcupantes ocupantes({int tope = 4, bool esTitular = true, int extra = 0}) => MisOcupantes(
    declarados: 3 + extra,
    declarada: true,
    aviso: '',
    tope: tope,
    esTitular: esTitular,
    plazas: [
      titular,
      libre,
      menor,
      for (var i = 0; i < extra; i++)
        PlazaDeOcupante(id: 'x$i', numero: 4 + i, libre: true, codigo: 'C$i', ocupante: null),
    ],
  );

  group('plazas (D-W10)', () {
    test('el cupo se lee «3 de 4», contando la del titular', () {
      expect(ocupantes().cupo, '3 de 4');
      expect(ocupantes().puedeAnadir, isTrue);
    });

    test('en el tope no se añade, y quien no es titular nunca añade', () {
      expect(ocupantes(extra: 1).alTope, isTrue);
      expect(ocupantes(extra: 1).puedeAnadir, isFalse);
      expect(ocupantes(esTitular: false).puedeAnadir, isFalse);
    });

    test('sólo el titular retira, sólo las libres y nunca la primera', () {
      final o = ocupantes();
      expect(o.sePuedeRetirar(libre), isTrue);
      expect(o.sePuedeRetirar(menor), isFalse, reason: 'ocupada por un menor');
      expect(o.sePuedeRetirar(titular), isFalse);
      expect(ocupantes(esTitular: false).sePuedeRetirar(libre), isFalse);
      const primeraLibre = PlazaDeOcupante(
        id: 'p1',
        numero: 1,
        libre: true,
        codigo: 'X',
        ocupante: null,
      );
      expect(o.sePuedeRetirar(primeraLibre), isFalse);
    });

    test('las libres son las que tienen código', () {
      expect(ocupantes().libres.map((p) => p.id), ['p2']);
    });

    test('lo que se comparte dice qué hacer con el código', () {
      expect(
        mensajeParaCompartir('MIRA-ABCD-EFGH'),
        'Descargue la app, pulse Crear cuenta y use este código: MIRA-ABCD-EFGH',
      );
    });
  });

  group('menores (D-W2)', () {
    MenorDelHogar menorDe({int? edad}) => MenorDelHogar(
      residenteId: 'r-3',
      nombres: 'Sofía',
      apellidos: 'Pérez',
      nombreCompleto: 'Sofía Pérez',
      fechaNacimiento: '2015-08-21',
      edad: edad,
      tipoDocumento: 'tarjeta_identidad',
      documento: '••••5678',
      parentesco: 'Hija',
      plazaId: 'p3',
      plazaNumero: 3,
      tieneRostro: false,
    );

    test('la edad la da el servidor; desde los 18 ya puede tener su cuenta', () {
      expect(menorDe(edad: 11).yaEsMayor, isFalse);
      expect(menorDe(edad: mayoriaDeEdad).yaEsMayor, isTrue);
      expect(menorDe().yaEsMayor, isFalse, reason: 'sin fecha no se presume mayor');
    });

    test('el documento se describe con su tipo y llega enmascarado', () {
      expect(menorDe(edad: 11).documentoLegible, 'Tarjeta de identidad ••••5678');
      expect(tiposDeDocumentoDeMenor.keys, ['tarjeta_identidad', 'registro_civil']);
    });
  });

  group('vehículo propio eliminado', () {
    test('se dice si se borró o si quedó dado de baja con su historial', () {
      expect(
        textoDeEliminacion(EliminacionDeVehiculo.borrado, 'ABC123'),
        'Vehículo ABC123 eliminado.',
      );
      expect(
        textoDeEliminacion(EliminacionDeVehiculo.dadoDeBaja, 'ABC123'),
        contains('dado de baja'),
      );
    });
  });

  group('visita revocada (D-W6)', () {
    Autorizacion visita(SituacionDeVisita s) => Autorizacion(
      id: 'a',
      visitante: 'Ana',
      tipo: 'unica',
      desde: DateTime.utc(2026, 10, 6, 10),
      hasta: DateTime.utc(2026, 10, 6, 14),
      placa: null,
      permiteAccesoVehicular: false,
      estado: 'activa',
      acompanantes: 0,
      situacion: s,
    );

    test('se revoca lo que aún no venció ni se anuló', () {
      expect(sePuedeRevocar(visita(SituacionDeVisita.vigente)), isTrue);
      expect(sePuedeRevocar(visita(SituacionDeVisita.programada)), isTrue);
      expect(sePuedeRevocar(visita(SituacionDeVisita.vencida)), isFalse);
      expect(sePuedeRevocar(visita(SituacionDeVisita.rechazada)), isFalse);
      expect(sePuedeRevocar(visita(SituacionDeVisita.desconocida)), isFalse);
    });

    test('el aviso dice de cuántos equipos salió la foto', () {
      expect(
        const VisitaRevocada(rostrosSuprimidos: 0, equiposRetirados: 0, equiposPendientes: 0).texto,
        'Visita revocada.',
      );
      expect(
        const VisitaRevocada(rostrosSuprimidos: 1, equiposRetirados: 2, equiposPendientes: 1).texto,
        'Visita revocada. Su foto salió de 2 equipo(s); 1 más la retirará en cuanto responda.',
      );
    });
  });

  group('primer ingreso (D3)', () {
    test('los motivos nuevos tienen su texto, aunque el servidor no lo mande', () {
      expect(explicacionDeAlta('SIN_VIVIENDA'), 'La administración debe asignarle su vivienda');
      expect(explicacionDeAlta('CUENTA_BLOQUEADA_POR_EDAD'), mensajeCuentaDeMenor);
      expect(explicacionDeAlta('DOCUMENTO_EN_USO'), contains('otra cuenta'));
      expect(
        explicacionDeAlta('TITULAR_NO_SE_MUDA'),
        'Como titular de su vivienda, no puede cambiarse de vivienda desde la app: pídalo a la '
        'administración.',
      );
      expect(explicacionDeAlta('MOTIVO_NUEVO'), contains('administración'));
    });

    test('el rechazo sabe si la cuenta quedó bloqueada o si falta la vivienda', () {
      const bloqueo = AltaRechazada(motivo: 'CUENTA_BLOQUEADA_POR_EDAD', explicacion: '');
      const sinVivienda = AltaRechazada(motivo: 'SIN_VIVIENDA', explicacion: '');
      expect((bloqueo.bloqueadaPorEdad, bloqueo.sinVivienda), (true, false));
      expect((sinVivienda.bloqueadaPorEdad, sinVivienda.sinVivienda), (false, true));
    });

    test('el documento de una cuenta es de adulto', () {
      expect(tiposDeDocumentoDeAdulto.keys, ['cedula', 'cedula_extranjeria', 'pasaporte']);
    });
  });
}
