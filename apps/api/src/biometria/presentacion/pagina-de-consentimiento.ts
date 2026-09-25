import type { ConsentimientoBiometrico } from '@ncr/domain-core';

/**
 * La página que ve el TITULAR. HTML sin JavaScript y sin estilos en línea: la
 * API sirve con la CSP de §2.7.7 (`default-src 'self'`, sin `unsafe-inline`),
 * y esta página la respeta en vez de pedir una excepción. Un formulario y dos
 * botones bastan para aceptar o rechazar; la legibilidad la da el HTML
 * semántico, que cualquier teléfono pinta sin ayuda.
 *
 * Lo que la página NO muestra: ningún dato del titular más allá de lo que él
 * mismo está decidiendo —finalidad, versión de la política, estado—. Un enlace
 * reenviado por error no cuenta nada de nadie.
 */
const escapar = (texto: string): string =>
  texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const documento = (titulo: string, cuerpo: string): string =>
  `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapar(titulo)} · Next Control Residencial</title>
</head>
<body>
<main>
<h1>${escapar(titulo)}</h1>
${cuerpo}
<hr>
<p><small>Next Control Residencial · tratamiento de datos biométricos conforme a la Ley 1581 de 2012 (Colombia).</small></p>
</main>
</body>
</html>
`;

const fecha = (instante: Date | null): string =>
  instante === null ? '—' : instante.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

const formulario = (accion: string, campos: string, boton: string): string =>
  `<form method="post" action="${escapar(accion)}">${campos}<p><button type="submit">${escapar(boton)}</button></p></form>`;

export const paginaDeEnlaceInvalido = (): string =>
  documento(
    'Enlace no válido',
    `<p>Este enlace no es válido o ya venció. Pida uno nuevo a quien registró su visita.</p>`,
  );

export const paginaDeConsentimiento = (
  c: ConsentimientoBiometrico,
  rutaBase: string,
  aviso: string | null,
): string => {
  const ficha = `
<dl>
<dt>Finalidad</dt><dd>${escapar(c.finalidad === 'control_acceso' ? 'control de acceso a la copropiedad' : c.finalidad)}</dd>
<dt>Versión de la política de tratamiento</dt><dd>${escapar(c.versionPolitica)}</dd>
<dt>Solicitado</dt><dd>${escapar(fecha(c.solicitadoEn))}</dd>
<dt>Estado</dt><dd><strong>${escapar(c.estado)}</strong></dd>
</dl>`;
  const nota = aviso === null ? '' : `<p role="status"><strong>${escapar(aviso)}</strong></p>`;

  if (c.estado === 'pendiente') {
    return documento(
      'Consentimiento para el uso de su rostro',
      `${nota}
<p>Se le pide autorización para <strong>registrar su rostro</strong> y usarlo únicamente para
reconocerlo en los puntos de acceso de la copropiedad mientras dure su visita. La imagen se guarda
cifrada, se envía sólo a los equipos de acceso y <strong>se elimina automáticamente</strong> al
vencer su autorización, o antes si usted lo pide.</p>
${ficha}
<p>Usted es el <strong>titular</strong> del dato: sólo usted puede responder. Nadie responde por usted.</p>
${formulario(`${rutaBase}/respuesta`, '<input type="hidden" name="acepta" value="si">', 'Acepto')}
${formulario(`${rutaBase}/respuesta`, '<input type="hidden" name="acepta" value="no">', 'No acepto')}
<p>Si no acepta, su visita sigue autorizada por su placa o por el portero, sin reconocimiento facial.</p>`,
    );
  }

  if (c.estado === 'vigente') {
    return documento(
      'Consentimiento otorgado',
      `${nota}
<p>Su rostro puede usarse para reconocerlo en los accesos mientras dure su visita. Otorgado el
${escapar(fecha(c.otorgadoEn))}.</p>
${ficha}
<p>Puede <strong>revocar</strong> este consentimiento en cualquier momento. Al hacerlo, su plantilla
se elimina de inmediato de la base y de los equipos de acceso.</p>
${formulario(`${rutaBase}/revocacion`, '', 'Revocar mi consentimiento')}`,
    );
  }

  const titulos: Record<string, string> = {
    rechazado: 'Consentimiento rechazado',
    revocado: 'Consentimiento revocado',
    expirado: 'Solicitud vencida',
  };
  return documento(
    titulos[c.estado] ?? 'Consentimiento',
    `${nota}
<p>Este consentimiento ya está cerrado (${escapar(c.estado)}). Ningún dato biométrico suyo queda
en uso; si desea registrarse de nuevo, pida una nueva solicitud a quien gestiona su visita.</p>
${ficha}`,
  );
};
