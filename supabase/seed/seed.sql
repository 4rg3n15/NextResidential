-- =============================================================================
-- Semillas · una copropiedad ficticia coherente con los mockups
--
-- Datos inventados. CERO datos reales, CERO secretos, CERO credenciales.
-- Las referencias de credencial son del tipo `vault:...` — punteros a bóveda,
-- nunca valores (RN-21, decisión D-09b).
--
-- Se ejecuta con un rol con privilegio suficiente (migraciones / mantenimiento).
-- El contexto de sesión se fija explícitamente para que `creado_por` tenga
-- valor: en este esquema ninguna escritura es anónima (KPI-05, §4.3).
-- =============================================================================

BEGIN;

-- Identidades de arranque ------------------------------------------------------
-- usuario_sistema es la única fila cuyo creado_por se referencia a sí misma:
-- es el único ciclo del esquema y está acotado a una fila conocida.
INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, correo, nombre,
                             creado_por, actualizado_por)
VALUES ('00000000-0000-4000-8000-000000000001', NULL,
        '00000000-0000-4000-8000-0000000000a1',
        'sistema@nextcontrol.invalid', 'Usuario de sistema',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, correo, nombre,
                             mfa_habilitado, creado_por, actualizado_por)
VALUES ('00000000-0000-4000-8000-000000000002', NULL,
        '00000000-0000-4000-8000-0000000000a2',
        'superadmin@nextcontrol.invalid', 'Superadministrador de plataforma', true,
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002"}';

-- Copropiedad ------------------------------------------------------------------
INSERT INTO public.copropiedades (id, nombre, nit, zona_horaria, creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000001', 'Urbanizacion Mira', '900123456',
        'America/Bogota',
        '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Segunda copropiedad: existe para que la suite de aislamiento tenga contra qué
-- probar. Sin un segundo tenant, las pruebas negativas no prueban nada.
INSERT INTO public.copropiedades (id, nombre, nit, creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000002', 'Parcelacion El Roble', '900987654',
        '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Roles del superadministrador (necesario para el disparador tg_usuario_tenant)
INSERT INTO public.roles_usuario (id, copropiedad_id, usuario_id, rol, creado_por, actualizado_por)
VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002','superadministrador',
        '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
       -- usuario_sistema es identidad de PLATAFORMA (copropiedad_id NULL), por lo
       -- que su rol debe ser superadministrador: el disparador tg_usuario_tenant
       -- solo admite tenant nulo para ese rol (decision D-02).
       ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001','superadministrador',
        '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Usuarios de la copropiedad ---------------------------------------------------
INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, correo, nombre, mfa_habilitado,
                             creado_por, actualizado_por)
VALUES
 ('00000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000b0','ana.martinez@urbanizacionmira.invalid',
  'Lic. Ana Martinez', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000b1','carlos.mendoza@urbanizacionmira.invalid',
  'Carlos Mendoza', false,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000b2','operador.central@nextcontrol.invalid',
  'Operador de central', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000b3','maria.gonzalez@correo.invalid',
  'Maria Gonzalez', false,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000b4','edge.mira@nextcontrol.invalid',
  'Edge Gateway Mira (servicio)', false,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 -- Administrador de la OTRA copropiedad: sujeto de las pruebas negativas.
 ('00000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-0000000000c0','admin@elroble.invalid',
  'Administrador El Roble', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles_usuario (copropiedad_id, usuario_id, rol, creado_por, actualizado_por)
VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','administrador',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','portero',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012','operador_central',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 -- El operador atiende TAMBIEN la segunda copropiedad (HU-25, KPI-35).
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000012','operador_central',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000013','residente',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000014','servicio',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','administrador',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

-- Catálogo de niveles de acceso · resolución de P-11 ---------------------------
-- Catálogo, no booleano: arranca con dos valores y admite más sin migración.
-- orden 1 = el más restrictivo, que es el que asigna el disparador por defecto.
INSERT INTO public.niveles_acceso (copropiedad_id, clave, nombre, descripcion, orden,
                                   permite_autorizar, creado_por, actualizado_por)
SELECT c.id, v.clave, v.nombre, v.descripcion, v.orden, v.permite_autorizar,
       '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'
  FROM public.copropiedades c
 CROSS JOIN (VALUES
   ('solo_ingreso','Solo ingreso','Entra y sale; no crea autorizaciones de visitante.', 1::smallint, false),
   ('completo','Acceso completo','Gestiona vehiculos y autoriza visitantes de su vivienda.', 2::smallint, true)
 ) AS v(clave, nombre, descripcion, orden, permite_autorizar)
ON CONFLICT DO NOTHING;

-- Padrón · viviendas del mockup W-03 -------------------------------------------
INSERT INTO public.viviendas (id, copropiedad_id, identificador, manzana, creado_por, actualizado_por)
VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Casa 01','A',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Casa 02','A',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000042','10000000-0000-4000-8000-000000000001','Casa 42','B',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000089','10000000-0000-4000-8000-000000000001','Casa 89','C',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 -- Vivienda de la otra copropiedad, para las pruebas negativas.
 ('30000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000002','Lote 01','U',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.personas (id, copropiedad_id, tipo_documento, numero_documento,
                             nombre_completo, telefono, correo, creado_por, actualizado_por)
VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','cedula','1723458001',
  'Carlos Eduardo Silva','+573001110001',NULL,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','cedula','1723458002',
  'Maria Fernanda Lopez','+573001110002',NULL,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','cedula','1723458013',
  'Maria Gonzalez','+573001110013','maria.gonzalez@correo.invalid',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000089','10000000-0000-4000-8000-000000000001','cedula','1723458089',
  'Laura Gomez','+573001110089',NULL,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 -- Visitantes y acompañantes
 ('40000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000001','cedula','1723458921',
  'Juan Perez','+573002220101',NULL,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000001','cedula','1719284735',
  'Sandra Bermudez','+573002220102',NULL,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000001','cedula','1098473215',
  'Marcos Torres','+573002220103',NULL,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 -- Persona en lista negra: sirve para probar RN-06 tambien como acompanante.
 ('40000000-0000-4000-8000-000000000199','10000000-0000-4000-8000-000000000001','cedula','1000000199',
  'Persona No Autorizada',NULL,NULL,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000002','cedula','2000000201',
  'Residente El Roble',NULL,NULL,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

UPDATE public.usuarios SET persona_id = '40000000-0000-4000-8000-000000000013'
 WHERE id = '00000000-0000-4000-8000-000000000013';

-- Residentes. nivel_acceso_id se deja NULL a proposito: el disparador asigna el
-- mas restrictivo (P-11). El titular se eleva despues, explicitamente.
INSERT INTO public.residentes (id, copropiedad_id, vivienda_id, persona_id, parentesco,
                               es_titular, creado_por, actualizado_por)
VALUES
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Propietario', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','Propietario', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('50000000-0000-4000-8000-000000000042','10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000042','40000000-0000-4000-8000-000000000013','Propietario', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('50000000-0000-4000-8000-000000000089','10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000089','40000000-0000-4000-8000-000000000089','Propietario', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('50000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000201','Propietario', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

UPDATE public.residentes r
   SET nivel_acceso_id = n.id
  FROM public.niveles_acceso n
 WHERE n.copropiedad_id = r.copropiedad_id AND n.clave = 'completo' AND r.es_titular;

-- Vehículos · placas del mockup W-04, normalizadas por el VO Placa -------------
INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, persona_id, placa, marca, modelo, color,
                              es_principal, creado_por, actualizado_por)
VALUES
 ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','PCH2145','Chevrolet','Vitara','Gris', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002','GBA7890','Toyota','Hilux','Blanco', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000042',
  '40000000-0000-4000-8000-000000000013','ABC1234','Toyota','RAV4','Gris', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 -- Misma placa en OTRA copropiedad: es legitimo, y lo demuestra la prueba de
 -- que el indice unico es por copropiedad y no global (decision D-05).
 ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000101',
  '40000000-0000-4000-8000-000000000201','ABC1234','Mazda','CX-5','Negro', true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

-- Visitantes y autorizaciones --------------------------------------------------
INSERT INTO public.visitantes (id, copropiedad_id, persona_id, empresa, categoria,
                               creado_por, actualizado_por)
VALUES
 ('60000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000101',NULL,'visitante',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('60000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000102',NULL,'servicio_domestico',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('60000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000103','Pinturas Torres','contratista',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Autorización única, vigente hoy (CA-04).
INSERT INTO public.autorizaciones (id, copropiedad_id, vivienda_id, visitante_id, autorizado_por,
                                   tipo, placa, vigencia, permite_acceso_vehicular,
                                   creado_por, actualizado_por)
VALUES
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000042','60000000-0000-4000-8000-000000000101',
  '50000000-0000-4000-8000-000000000042','unica','ABC9999',
  tstzrange(now() - interval '1 hour', now() + interval '8 hours', '[)'), true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 -- Autorización recurrente: lunes a viernes de 07:00 a 12:00 (CA-06).
 ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000042','60000000-0000-4000-8000-000000000102',
  '50000000-0000-4000-8000-000000000042','recurrente',NULL,
  tstzrange(now() - interval '1 day', now() + interval '90 days', '[)'), false,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 -- Autorización ya vencida (CA-05).
 ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000089','60000000-0000-4000-8000-000000000103',
  '50000000-0000-4000-8000-000000000089','unica','XYZ9999',
  tstzrange(now() - interval '5 days', now() - interval '1 day', '[)'), true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.patrones_recurrencia (copropiedad_id, autorizacion_id, dia_semana,
                                         hora_inicio, hora_fin, creado_por, actualizado_por)
SELECT '10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',
       d, time '07:00', time '12:00',
       '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'
  FROM generate_series(1,5) AS d
ON CONFLICT DO NOTHING;

-- Acompañante nominal (resolución de C-06).
INSERT INTO public.autorizacion_acompanantes (copropiedad_id, autorizacion_id, persona_id,
                                              creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000103',
        '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

-- Lista negra (RN-06, CA-13) ---------------------------------------------------
INSERT INTO public.listas_negras (copropiedad_id, persona_id, motivo, creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000199',
        'Ingreso no autorizado registrado en bitacora del 12 de agosto.',
        '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;
INSERT INTO public.listas_negras (copropiedad_id, placa, motivo, creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000001','XYZ0000',
        'Placa reportada por la administracion.',
        '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

-- Zonas comunes · valores del mockup W-06 --------------------------------------
INSERT INTO public.zonas (id, copropiedad_id, nombre, tipo, abierta, normas, creado_por, actualizado_por)
VALUES
 ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Piscina','comun', true,
  ARRAY['Requiere traje de bano adecuado','Ninos bajo supervision de un adulto'],
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Gimnasio','comun', true,
  ARRAY['Uso obligatorio de toalla personal','Tiempo maximo de cardio: 45 min'],
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Salon Social','comun', false,
  ARRAY['Requiere reserva previa','Deposito de garantia reembolsable'],
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('80000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Coworking','comun', true,
  ARRAY['Mantener tono de voz moderado','No se permiten alimentos pesados'],
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('80000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Entrada Vehicular','vehicular', true,
  ARRAY[]::text[],
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Aforos del mockup: Piscina 12/30, Gimnasio 22/25, Salon 0/100, Coworking 8/20.
INSERT INTO public.zona_aforo (zona_id, copropiedad_id, aforo_maximo, conteo_actual)
VALUES
 ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001', 30, 12),
 ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001', 25, 22),
 ('80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',100,  0),
 ('80000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001', 20,  8),
 ('80000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001',999,  0)
ON CONFLICT (zona_id) DO NOTHING;

-- Horarios. La piscina abre 08:00-21:00 todos los dias (mockup W-06).
INSERT INTO public.zona_horarios (copropiedad_id, zona_id, dia_semana, hora_inicio, hora_fin,
                                  creado_por, actualizado_por)
SELECT '10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
       d, time '08:00', time '21:00',
       '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'
  FROM generate_series(1,7) AS d
ON CONFLICT DO NOTHING;

-- Salon Social: Vie-Dom 10:00-01:00. Cruza la medianoche, asi que se modela
-- como dos filas (supuesto S-09). La fila de continuacion NO es un cierre de
-- jornada: el contador de aforo no se reinicia en ese corte.
INSERT INTO public.zona_horarios (copropiedad_id, zona_id, dia_semana, hora_inicio, hora_fin,
                                  continua_del_dia_anterior, creado_por, actualizado_por)
VALUES
 ('10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000003',5,time '10:00',time '23:59:59',false,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000003',6,time '00:00',time '01:00',true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000003',6,time '10:00',time '23:59:59',false,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000003',7,time '00:00',time '01:00',true,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

-- Dispositivos · mockup W-07 · credenciales como REFERENCIA (RN-21) ------------
INSERT INTO public.dispositivos (id, copropiedad_id, zona_id, nombre, tipo, host, puerto,
                                 credencial_ref, modelo, firmware, creado_por, actualizado_por)
VALUES
 ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000005','Camara LPR - Entrada Principal','camara_lpr',
  'lpr-entrada.mira.local',80,'vault:mira/camara-lpr-entrada','ejemplo-lpr','v2.4.1',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000002','Terminal Facial - Gimnasio','terminal_facial',
  'facial-gimnasio.mira.local',80,'vault:mira/terminal-facial-gimnasio','ejemplo-facial','v3.0.2',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('90000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000005','Talanquera - Acceso Vehicular','rele',
  'rele-talanquera.mira.local',80,'vault:mira/rele-talanquera','ejemplo-rele','v1.8.3',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('90000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',
  NULL,'Intercomunicador - Bloque A','intercom',
  'intercom-a.mira.local',80,'vault:mira/intercom-bloque-a','ejemplo-intercom','v1.2.0',
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.puntos_de_acceso (copropiedad_id, zona_id, dispositivo_id, nombre, tipo, sentido,
                                     creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000005',
        '90000000-0000-4000-8000-000000000003','Talanquera Norte','talanquera','bidireccional',
        '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.edge_gateways (id, copropiedad_id, nombre, usuario_servicio_id, credencial_ref,
                                  creado_por, actualizado_por)
VALUES ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
        'Edge Mira 01','00000000-0000-4000-8000-000000000014','vault:mira/edge-01',
        '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Versión de reglas inicial ----------------------------------------------------
INSERT INTO public.versiones_de_reglas (id, copropiedad_id, numero, hash, publicada_por,
                                        creado_por, actualizado_por)
VALUES ('b0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,
        repeat('a',64),'00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.reglas (copropiedad_id, version_id, clave, prioridad, definicion,
                           creado_por, actualizado_por)
VALUES
 ('10000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',
  'lista_negra',1,'{"tipo":"lista_negra","precedencia":"absoluta"}'::jsonb,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',
  'vigencia',2,'{"tipo":"vigencia"}'::jsonb,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',
  'patron_recurrencia',3,'{"tipo":"patron"}'::jsonb,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',
  'zona',4,'{"tipo":"zona","valida":["horario","aforo"]}'::jsonb,
  '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

COMMIT;
