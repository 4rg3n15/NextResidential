import { describe, expect, it } from 'vitest';
import {
  LIMITES,
  esParteBiometrica,
  SobreIlegible,
  abrirSobreDeAlarmServer,
  clasificarSobre,
  partirSobre,
  separadorDe,
} from './publicacion-alarm-server';

/** Arma un multipart de verdad, con CRLF, como lo emite un equipo. */
const sobre = (
  separador: string,
  partes: readonly {
    nombre?: string;
    fichero?: string;
    tipo?: string;
    contenido: Buffer | string;
  }[],
): Buffer => {
  const trozos: Buffer[] = [];
  for (const p of partes) {
    const disposicion = [
      'Content-Disposition: form-data',
      p.nombre === undefined ? null : `name="${p.nombre}"`,
      p.fichero === undefined ? null : `filename="${p.fichero}"`,
    ]
      .filter((t) => t !== null)
      .join('; ');
    const cabeceras = [disposicion, p.tipo === undefined ? null : `Content-Type: ${p.tipo}`]
      .filter((t) => t !== null)
      .join('\r\n');
    trozos.push(Buffer.from(`--${separador}\r\n${cabeceras}\r\n\r\n`));
    trozos.push(Buffer.isBuffer(p.contenido) ? p.contenido : Buffer.from(p.contenido));
    trozos.push(Buffer.from('\r\n'));
  }
  trozos.push(Buffer.from(`--${separador}--\r\n`));
  return Buffer.concat(trozos);
};

const XML =
  '<?xml version="1.0" encoding="UTF-8"?><EventNotificationAlert>' +
  '<eventType>ANPR</eventType><licensePlate>ABC123</licensePlate>' +
  '<confidenceLevel>92</confidenceLevel></EventNotificationAlert>';

/** Bytes que NO sobreviven a un `toString('utf8')`: el defecto que se persigue. */
const JPEG_FALSO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x80, 0x81, 0xfe, 0xff, 0xd9]);

describe('separadorDe', () => {
  it('lo saca de la forma desnuda y de la entrecomillada', () => {
    expect(separadorDe('multipart/form-data; boundary=MIME_boundary')).toBe('MIME_boundary');
    expect(separadorDe('multipart/form-data; boundary="con espacio"')).toBe('con espacio');
  });

  it('devuelve null para lo que no es multipart', () => {
    expect(separadorDe('application/xml')).toBeNull();
    expect(separadorDe(undefined)).toBeNull();
    expect(separadorDe(null)).toBeNull();
    // Multipart SIN separador: no se adivina.
    expect(separadorDe('multipart/form-data')).toBeNull();
  });
});

describe('partirSobre', () => {
  it('separa las partes y conserva los bytes binarios INTACTOS', () => {
    const partes = partirSobre(
      sobre('X', [
        { nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML },
        {
          nombre: 'detectionPicture',
          fichero: 'foto.jpg',
          tipo: 'image/jpeg',
          contenido: JPEG_FALSO,
        },
      ]),
      'X',
    );

    expect(partes).toHaveLength(2);
    expect(partes[0]?.contenido.toString('utf8')).toBe(XML);
    // La comprobación que importa: pasar el JPEG por utf8 lo habría corrompido
    // y nadie lo vería hasta abrir la evidencia meses después.
    expect(partes[1]?.contenido.equals(JPEG_FALSO)).toBe(true);
    expect(partes[1]?.tipoDeContenido).toBe('image/jpeg');
    expect(partes[1]?.nombreDeFichero).toBe('foto.jpg');
  });

  it('rechaza un cuerpo sin el separador anunciado', () => {
    expect(() => partirSobre(Buffer.from('no hay nada aquí'), 'X')).toThrow(SobreIlegible);
  });

  it('rechaza una parte con las cabeceras sin terminar', () => {
    const roto = Buffer.from('--X\r\nContent-Disposition: form-data; name="a"\r\n--X--\r\n');
    expect(() => partirSobre(roto, 'X')).toThrow(/cabeceras/i);
  });

  it('rechaza un cuerpo desproporcionado ANTES de recorrerlo', () => {
    const enorme = Buffer.alloc(LIMITES.cuerpoMaximoBytes + 1);
    expect(() => partirSobre(enorme, 'X')).toThrow(/supera/i);
  });

  it('rechaza un sobre con más partes de las admitidas', () => {
    const muchas = Array.from({ length: LIMITES.partesMaximas + 2 }, (_, i) => ({
      nombre: `p${String(i)}`,
      contenido: 'x',
    }));
    expect(() => partirSobre(sobre('X', muchas), 'X')).toThrow(/partes/i);
  });
});

describe('clasificarSobre', () => {
  it('con DOS imágenes, la menor es el recorte y la otra la escena', () => {
    const escena = Buffer.alloc(4096, 1);
    const recorte = Buffer.alloc(256, 2);
    const resultado = clasificarSobre(
      partirSobre(
        sobre('B', [
          { nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML },
          { nombre: 'detectionPicture', tipo: 'image/jpeg', contenido: escena },
          { nombre: 'licensePlatePicture', tipo: 'image/jpeg', contenido: recorte },
        ]),
        'B',
      ),
    );

    expect(resultado.documento).toContain('ABC123');
    expect(resultado.recorte?.equals(recorte)).toBe(true);
    expect(resultado.foto?.equals(escena)).toBe(true);
  });

  it('con DOS imágenes y una sola PISTA de nombre, manda la pista y no el tamaño', () => {
    // El desempate por tamaño es el repliegue. Cuando el nombre lo dice, se
    // cree al nombre aunque el recorte salga más grande que la escena, que
    // pasa con una escena muy comprimida y un recorte con mucho detalle.
    const escenaPequena = Buffer.alloc(128, 1);
    const recorteGrande = Buffer.alloc(4096, 2);
    const resultado = clasificarSobre(
      partirSobre(
        sobre('B', [
          { nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML },
          { nombre: 'escena', tipo: 'image/jpeg', contenido: escenaPequena },
          { nombre: 'licensePlatePicture', tipo: 'image/jpeg', contenido: recorteGrande },
        ]),
        'B',
      ),
    );
    expect(resultado.recorte?.equals(recorteGrande)).toBe(true);
    expect(resultado.foto?.equals(escenaPequena)).toBe(true);
  });

  it('con DOS pistas a la vez, se cae al desempate por TAMAÑO', () => {
    // Dos nombres que casan la pista no desempatan nada: el tamaño sí.
    const grande = Buffer.alloc(4096, 1);
    const pequena = Buffer.alloc(128, 2);
    const resultado = clasificarSobre(
      partirSobre(
        sobre('B', [
          { nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML },
          { nombre: 'platePictureA', tipo: 'image/jpeg', contenido: grande },
          { nombre: 'platePictureB', tipo: 'image/jpeg', contenido: pequena },
        ]),
        'B',
      ),
    );
    expect(resultado.recorte?.equals(pequena)).toBe(true);
    expect(resultado.foto?.equals(grande)).toBe(true);
  });

  it('con UNA sola imagen, es la escena y no el recorte', () => {
    // El recorte nunca viene solo; tratarlo como tal dejaría la evidencia sin
    // la foto de la escena, que es la que un incidente necesita.
    const resultado = clasificarSobre(
      partirSobre(
        sobre('B', [
          { nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML },
          { nombre: 'pic', tipo: 'image/jpeg', contenido: JPEG_FALSO },
        ]),
        'B',
      ),
    );
    expect(resultado.foto?.equals(JPEG_FALSO)).toBe(true);
    expect(resultado.recorte).toBeNull();
  });

  it('clasifica por TIPO cuando el nombre de la parte no dice nada', () => {
    // Es la razón de no depender de los nombres: están documentados y no
    // verificados contra este firmware.
    const resultado = clasificarSobre(
      partirSobre(
        sobre('B', [
          { nombre: 'sin_pista_alguna', tipo: 'application/xml', contenido: XML },
          { nombre: 'tampoco', tipo: 'image/jpeg', contenido: JPEG_FALSO },
        ]),
        'B',
      ),
    );
    expect(resultado.documento).toContain('ABC123');
    expect(resultado.foto?.equals(JPEG_FALSO)).toBe(true);
  });

  it('cuenta las partes que no supo clasificar en vez de tirarlas en silencio', () => {
    const resultado = clasificarSobre(
      partirSobre(
        sobre('B', [
          { nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML },
          { nombre: 'raro', tipo: 'application/octet-stream', contenido: 'zzz' },
        ]),
        'B',
      ),
    );
    expect(resultado.partesNoClasificadas).toBe(1);
  });

  describe('H-16-1 · los recortes de ROSTRO se rechazan, y se cuentan', () => {
    /**
     * El sobre admite diez partes y dos son rostros: conductor y acompañante.
     * Si la configuración del equipo los activa entran datos biométricos de
     * personas que no dieron consentimiento, por un canal que no pasa por el
     * ciclo de la ETAPA 08 (RN-09, RN-10, Ley 1581). Y el equipo puede empezar
     * a enviarlos SIN que nadie toque este código: basta una casilla.
     */
    const conRostros = (nombres: readonly string[]) =>
      clasificarSobre(
        partirSobre(
          sobre('B', [
            { nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML },
            {
              nombre: 'detectionPicture.jpg',
              tipo: 'image/jpeg',
              contenido: Buffer.alloc(2048, 1),
            },
            ...nombres.map((n) => ({
              nombre: n,
              tipo: 'image/jpeg',
              contenido: Buffer.alloc(512, 9),
            })),
          ]),
          'B',
        ),
      );

    it('ni la foto ni el recorte salen siendo un rostro', () => {
      const r = conRostros(['pilotPicture.jpg', 'copilotPicture.jpg']);
      expect(r.partesBiometricasRechazadas).toBe(2);
      // La única imagen admisible era la escena: el recorte queda nulo en vez
      // de quedarse con la cara del conductor por ser la más pequeña.
      expect(r.recorte).toBeNull();
      expect(r.foto?.length).toBe(2048);
    });

    it('los rechaza también con el sufijo numérico que usa el equipo', () => {
      // Con varias del mismo tipo llegan como `_1`, `_2`.
      expect(
        conRostros(['pilotPicture_1.jpg', 'pilotPicture_2.jpg']).partesBiometricasRechazadas,
      ).toBe(2);
    });

    it('los rechaza por el NOMBRE de la parte aunque no traiga fichero', () => {
      expect(conRostros(['copilotPicture']).partesBiometricasRechazadas).toBe(1);
    });

    it('NO confunde con ellos a las partes legítimas', () => {
      const r = conRostros([]);
      expect(r.partesBiometricasRechazadas).toBe(0);
      expect(esParteBiometrica('pedestrianPicture.jpg', null)).toBe(false);
      expect(esParteBiometrica('compositePicture.jpg', null)).toBe(false);
      expect(esParteBiometrica('licensePlatePicture.jpg', null)).toBe(false);
    });

    it('un sobre que SÓLO trae rostros además del XML no deja ninguna imagen', () => {
      const r = conRostros([]);
      expect(r.foto?.length).toBe(2048);
      const soloRostros = clasificarSobre(
        partirSobre(
          sobre('B', [
            { nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML },
            { nombre: 'pilotPicture.jpg', tipo: 'image/jpeg', contenido: Buffer.alloc(512, 9) },
          ]),
          'B',
        ),
      );
      expect(soloRostros.foto).toBeNull();
      expect(soloRostros.recorte).toBeNull();
      expect(soloRostros.partesBiometricasRechazadas).toBe(1);
    });
  });

  it('admite las DIEZ partes que la guía del fabricante enumera', () => {
    // El techo anterior eran ocho y habría rechazado un sobre legítimo de un
    // equipo bien configurado.
    const diez = [
      { nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML },
      ...[
        'detectionPicture.jpg',
        'licensePlatePicture.jpg',
        'compositePicture.jpg',
        'plateBinaryPicture.jpg',
        'nonMotorPicture.jpg',
        'pedestrianDetectionPicture.jpg',
        'pedestrianPicture.jpg',
      ].map((n, i) => ({
        nombre: n,
        tipo: 'image/jpeg',
        contenido: Buffer.alloc(256 + i * 64, 1),
      })),
    ];
    expect(() => clasificarSobre(partirSobre(sobre('B', diez), 'B'))).not.toThrow();
  });

  it('un sobre sin XML no es un evento', () => {
    expect(() =>
      clasificarSobre(
        partirSobre(
          sobre('B', [{ nombre: 'pic', tipo: 'image/jpeg', contenido: JPEG_FALSO }]),
          'B',
        ),
      ),
    ).toThrow(/XML/i);
  });

  it('rechaza un XML desproporcionado', () => {
    const gigante = 'x'.repeat(LIMITES.xmlMaximoBytes + 1);
    expect(() =>
      clasificarSobre(
        partirSobre(sobre('B', [{ nombre: 'a.xml', tipo: 'text/xml', contenido: gigante }]), 'B'),
      ),
    ).toThrow(/desproporcionado/i);
  });
});

describe('abrirSobreDeAlarmServer', () => {
  it('recorre el camino entero desde el cuerpo crudo', () => {
    const cuerpo = sobre('----abc', [
      { nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML },
      { nombre: 'licensePlate.jpg', tipo: 'image/jpeg', contenido: JPEG_FALSO },
    ]);
    const abierto = abrirSobreDeAlarmServer(cuerpo, 'multipart/form-data; boundary=----abc');
    expect(abierto.documento).toContain('<eventType>ANPR</eventType>');
  });

  /**
   * A2 (ETAPA 15-E) · sin multipart no hay foto, pero SÍ puede haber evento:
   * la terminal facial publica el evento de control de acceso como JSON a
   * secas cuando no adjunta imagen, y la cámara puede publicar el XML a secas.
   * Hasta la 15-E eso era «ilegible» y un equipo bien configurado parecía mudo.
   */
  it('un cuerpo XML a secas se acepta como el documento del evento, sin imágenes', () => {
    const abierto = abrirSobreDeAlarmServer(Buffer.from(XML), 'application/xml');
    expect(abierto.formato).toBe('xml');
    expect(abierto.documento).toContain('<eventType>ANPR</eventType>');
    expect(abierto.foto).toBeNull();
    expect(abierto.recorte).toBeNull();
  });

  it('un cuerpo JSON a secas también, y se clasifica por el tipo de contenido', () => {
    const abierto = abrirSobreDeAlarmServer(
      Buffer.from('{"eventType":"AccessControllerEvent"}'),
      'application/json; charset=utf-8',
    );
    expect(abierto.formato).toBe('json');
    expect(abierto.partesBiometricasRechazadas).toBe(0);
  });

  it('sin tipo de contenido se decide por el primer carácter; lo que no es ni JSON ni XML se rechaza', () => {
    expect(abrirSobreDeAlarmServer(Buffer.from('  {"a":1}'), null).formato).toBe('json');
    expect(() => abrirSobreDeAlarmServer(Buffer.from('hola'), 'text/plain')).toThrow(
      /multipart ni un documento/i,
    );
    expect(() => abrirSobreDeAlarmServer(Buffer.alloc(0), 'application/json')).toThrow(
      /ningún cuerpo/i,
    );
  });

  it('un documento a secas también respeta el techo de tamaño del evento', () => {
    const enorme = Buffer.from('{' + 'x'.repeat(300 * 1024) + '}');
    expect(() => abrirSobreDeAlarmServer(enorme, 'application/json')).toThrow(/desproporcionado/);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * DOS DEFENSAS QUE LA GUÍA INTEGRAL OBLIGA A COMPROBAR · 15-C
 *
 * No son casos raros: son advertencias explícitas del propio documento sobre
 * cómo se comporta el equipo. Estaban cubiertas por construcción —el analizador
 * nunca miró la longitud de una parte— pero **nadie lo había comprobado**, y
 * «funciona por casualidad» y «funciona a propósito» se distinguen el día que
 * alguien optimiza el analizador.
 */
describe('defensas del sobre · lo que el documento advierte', () => {
  it('una parte SIN `Content-Length` se analiza igual', () => {
    // El documento avisa de que el RFC no obliga a declararlo y pide
    // contemplar su ausencia. El sobre se delimita por el separador, no por la
    // longitud: exigirla habría rechazado sobres legítimos.
    const cuerpo = Buffer.concat([
      Buffer.from('--B\r\nContent-Disposition: form-data; name="anpr.xml"\r\n'),
      Buffer.from('Content-Type: text/xml\r\n\r\n'),
      Buffer.from('<EventNotificationAlert><eventType>ANPR</eventType></EventNotificationAlert>'),
      Buffer.from('\r\n--B--\r\n'),
    ]);
    const sobre = abrirSobreDeAlarmServer(cuerpo, 'multipart/form-data; boundary=B');
    expect(sobre.documento).toContain('ANPR');
  });

  it('y CON `Content-Length` declarado tampoco cambia nada', () => {
    const xml = '<EventNotificationAlert><eventType>ANPR</eventType></EventNotificationAlert>';
    const cuerpo = Buffer.concat([
      Buffer.from('--B\r\nContent-Disposition: form-data; name="anpr.xml"\r\n'),
      Buffer.from(`Content-Type: text/xml\r\nContent-Length: ${String(xml.length)}\r\n\r\n`),
      Buffer.from(xml),
      Buffer.from('\r\n--B--\r\n'),
    ]);
    const sobre = abrirSobreDeAlarmServer(cuerpo, 'multipart/form-data; boundary=B');
    expect(sobre.documento).toBe(xml);
  });
});

describe('sobres que NO declaran el tipo de cada parte', () => {
  /**
   * No todos los firmwares ponen `Content-Type` en las partes: algunos dejan
   * sólo el nombre. Clasificar por el tipo y rendirse si falta dejaría el
   * evento entero como ilegible —placa incluida— por una cabecera que el
   * protocolo no obliga a enviar.
   */
  it('se clasifican por el nombre de la parte, no por el tipo declarado', () => {
    const escena = Buffer.alloc(4096, 1);
    const recorte = Buffer.alloc(256, 2);
    const resultado = clasificarSobre(
      partirSobre(
        sobre('B', [
          { nombre: 'anpr.xml', contenido: XML },
          { nombre: 'scene.jpg', contenido: escena },
          { nombre: 'plate.jpg', contenido: recorte },
        ]),
        'B',
      ),
    );
    expect(resultado.documento).toContain('ABC123');
    expect(resultado.recorte?.equals(recorte)).toBe(true);
    expect(resultado.foto?.equals(escena)).toBe(true);
  });

  it('y por el nombre de FICHERO cuando la disposición lo trae', () => {
    const resultado = clasificarSobre(
      partirSobre(
        sobre('B', [
          { nombre: 'parte1', fichero: 'anpr.xml', contenido: XML },
          { nombre: 'parte2', fichero: 'captura.jpeg', contenido: JPEG_FALSO },
        ]),
        'B',
      ),
    );
    expect(resultado.documento).toContain('ABC123');
    expect(resultado.foto?.equals(JPEG_FALSO)).toBe(true);
  });

  it('una parte que no es ni XML ni imagen se ignora sin romper el sobre', () => {
    const resultado = clasificarSobre(
      partirSobre(
        sobre('B', [
          { nombre: 'anpr.xml', contenido: XML },
          { nombre: 'metadata.bin', contenido: Buffer.from([0x00, 0x01]) },
        ]),
        'B',
      ),
    );
    expect(resultado.documento).toContain('ABC123');
    expect(resultado.foto).toBeNull();
  });
});

describe('6.7a · la parte del evento puede ser JSON', () => {
  it('se clasifica por tipo de contenido y el sobre dice su formato', () => {
    const json = '{"eventType":"ANPR","ANPR":{"licensePlate":"ABC123"}}';
    const resultado = clasificarSobre(
      partirSobre(
        sobre('J', [{ nombre: 'anpr.json', tipo: 'application/json', contenido: json }]),
        'J',
      ),
    );
    expect(resultado.formato).toBe('json');
    expect(resultado.documento).toBe(json);
  });

  it('y por el NOMBRE cuando el tipo no lo dice', () => {
    const resultado = clasificarSobre(
      partirSobre(sobre('J', [{ nombre: 'evento.json', contenido: '{"eventType":"ANPR"}' }]), 'J'),
    );
    expect(resultado.formato).toBe('json');
  });

  it('el XML sigue diciendo xml', () => {
    const resultado = clasificarSobre(
      partirSobre(sobre('X', [{ nombre: 'anpr.xml', tipo: 'text/xml', contenido: XML }]), 'X'),
    );
    expect(resultado.formato).toBe('xml');
  });
});
