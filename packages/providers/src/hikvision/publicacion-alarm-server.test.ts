import { describe, expect, it } from 'vitest';
import {
  LIMITES,
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

    expect(resultado.xml).toContain('ABC123');
    expect(resultado.recorte?.equals(recorte)).toBe(true);
    expect(resultado.foto?.equals(escena)).toBe(true);
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
    expect(resultado.xml).toContain('ABC123');
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
    expect(abierto.xml).toContain('<eventType>ANPR</eventType>');
  });

  it('un cuerpo que no es multipart se rechaza sin intentar adivinar', () => {
    expect(() => abrirSobreDeAlarmServer(Buffer.from(XML), 'application/xml')).toThrow(
      /multipart/i,
    );
  });
});
