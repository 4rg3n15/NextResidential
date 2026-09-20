import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/entidades.dart';

Vivienda vivienda({String? agrupacion, bool activa = true}) => Vivienda(
      id: 'v',
      identificador: '42',
      agrupacion: agrupacion,
      etiquetaVivienda: 'Casa',
      etiquetaAgrupacion: 'Manzana',
      direccion: null,
      copropiedadNombre: 'Conjunto',
      estadoAdministrativo: 'al_dia',
      activa: activa,
    );

void main() {
  group('Vivienda.titulo · la palabra se pinta, nunca se guarda', () {
    test('compone con la etiqueta de ESTA copropiedad', () {
      expect(vivienda(agrupacion: 'B').titulo, 'Casa 42 · Manzana B');
    });

    test('sin agrupación, no deja el separador colgando', () {
      // Una parcelación sin secciones: «Casa 42 · Manzana null» sería el
      // resultado de concatenar sin mirar.
      expect(vivienda().titulo, 'Casa 42');
    });

    test('usa la palabra del conjunto, no una fija en la app', () {
      // Un conjunto que llame «Torre» a sus agrupaciones y «Apto» a sus
      // viviendas funciona sin tocar la app: es el punto de la migración 0029.
      final torre = Vivienda(
        id: 'v',
        identificador: '302',
        agrupacion: '4',
        etiquetaVivienda: 'Apto',
        etiquetaAgrupacion: 'Torre',
        direccion: null,
        copropiedadNombre: 'Torres del Parque',
        estadoAdministrativo: 'al_dia',
        activa: true,
      );
      expect(torre.titulo, 'Apto 302 · Torre 4');
    });
  });

  group('Vehiculo.descripcion', () {
    Vehiculo v({String? marca, String? modelo, String? color}) => Vehiculo(
          id: 'x',
          placa: 'ABC123',
          marca: marca,
          modelo: modelo,
          color: color,
          esPrincipal: false,
          activo: true,
        );

    test('une lo que hay', () {
      expect(v(marca: 'Marca', modelo: 'Modelo', color: 'Rojo').descripcion, 'Marca · Modelo · Rojo');
    });

    test('con campos nulos no deja separadores sueltos', () {
      expect(v(marca: 'Marca').descripcion, 'Marca');
      expect(v().descripcion, '');
    });
  });

  group('Autorizacion.vigenteEn', () {
    final desde = DateTime.utc(2026, 9, 18, 10);
    final hasta = DateTime.utc(2026, 9, 18, 14);
    Autorizacion a(String estado) => Autorizacion(
          id: 'a',
          visitante: 'Visitante',
          tipo: 'unica',
          desde: desde,
          hasta: hasta,
          placa: null,
          permiteAccesoVehicular: false,
          estado: estado,
          acompanantes: 0,
        );

    test('dentro de la vigencia y activa', () {
      expect(a('activa').vigenteEn(DateTime.utc(2026, 9, 18, 12)), isTrue);
    });

    test('en el instante de inicio, sí; en el de fin, no', () {
      // El borde, explícito: `[desde, hasta)`, igual que el `tstzrange` de la
      // base. Si la app lo leyera al revés, marcaría vigente algo que la API
      // acaba de negar.
      expect(a('activa').vigenteEn(desde), isTrue);
      expect(a('activa').vigenteEn(hasta), isFalse);
    });

    test('revocada nunca está vigente, aunque la hora encaje', () {
      // RN-06 y la revocación: la ventana temporal no basta.
      expect(a('revocada').vigenteEn(DateTime.utc(2026, 9, 18, 12)), isFalse);
    });
  });

  test('EventoDeAcceso.negado distingue negado de permitido', () {
    EventoDeAcceso e(String? resultado) => EventoDeAcceso(
          id: 'e',
          ocurridoEn: DateTime.utc(2026, 9, 18, 12),
          tipo: 'acceso',
          resultado: resultado,
          motivo: null,
          metodo: 'placa',
          placaDetectada: null,
          persona: null,
          zona: null,
          decididoPorEdge: false,
        );
    expect(e('negado').negado, isTrue);
    expect(e('permitido').negado, isFalse);
    // Una alerta no lleva resultado (la base lo permite): no es una negación.
    expect(e(null).negado, isFalse);
  });

  // ── Las piezas de 11-C ─────────────────────────────────────────────────
  group('MotivoDeRechazo · la salida y el campo que señalar', () {
    test('la placa duplicada es lo ÚNICO que el residente arregla él mismo', () {
      // Los otros tres se resuelven llamando a la administración, y señalar un
      // campo ahí sería mandarle a corregir algo que no está mal.
      expect(MotivoDeRechazo.placaDuplicada.salida, SalidaDelRechazo.corrijaElFormulario);
      expect(MotivoDeRechazo.placaDuplicada.campoAResaltar, 'placa');
    });

    test('los otros tres no señalan ningún campo', () {
      for (final m in [
        MotivoDeRechazo.listaNegra,
        MotivoDeRechazo.viviendaInactiva,
        MotivoDeRechazo.sinNivelDeAcceso,
      ]) {
        expect(m.salida, SalidaDelRechazo.hableConLaAdministracion, reason: m.name);
        expect(m.campoAResaltar, isNull, reason: m.name);
      }
    });
  });

  group('ZonaComun · lo que la pantalla refleja', () {
    ZonaComun z(int aforo, int ocupacion) => ZonaComun(
          id: 'z',
          nombre: 'Piscina',
          aforoMaximo: aforo,
          ocupacionActual: ocupacion,
          abiertaAhora: true,
          franjasDeHoy: const [],
          requiereAutorizacion: false,
        );

    test('con el aforo configurado a la baja con gente dentro, dice LLENO', () {
      // «-3 plazas» no significa nada para quien lo lee.
      expect(z(10, 13).plazasLibres, -3);
      expect(z(10, 13).lleno, isTrue);
      expect(z(10, 13).ocupacionRelativa, 1.0);
    });

    test('sin aforo configurado no se inventa un porcentaje', () {
      expect(z(0, 5).ocupacionRelativa, isNull);
    });

    test('justo en el límite ya está lleno, no «queda una»', () {
      expect(z(10, 10).lleno, isTrue);
      expect(z(10, 9).lleno, isFalse);
    });
  });
}
