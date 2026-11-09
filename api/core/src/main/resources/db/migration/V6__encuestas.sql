-- ÓRBITA · Encuestas: el pulso de Comunicación con RRHH pasa a ser una aplicación propia, más completa. Se conservan
-- las encuestas y respuestas que ya hay. El anonimato sigue igual: las respuestas no guardan usuario ni hora.

-- Encuesta: borradores y aperturas programadas, serie para comparar con la anterior y mensaje de agradecimiento
ALTER TABLE ENCUESTA ALTER COLUMN ABIERTA DROP NOT NULL;       -- un borrador aún no se ha abierto
ALTER TABLE ENCUESTA ADD COLUMN SERIE VARCHAR(40);             -- PULSO, CLIMA, BIENESTAR...: se compara con la anterior de la serie
ALTER TABLE ENCUESTA ADD COLUMN APERTURA TIMESTAMP;            -- apertura programada (ESTADO = PROGRAMADA)
ALTER TABLE ENCUESTA ADD COLUMN GRACIAS VARCHAR(500);          -- mensaje al terminar
ALTER TABLE ENCUESTA ADD COLUMN RECORDADA TIMESTAMP;           -- último recordatorio a quien no ha respondido
ALTER TABLE ENCUESTA ADD COLUMN CREADA TIMESTAMP;
UPDATE ENCUESTA SET SERIE = 'PULSO', CREADA = ABIERTA WHERE SERIE IS NULL;
-- ESTADO: BORRADOR, PROGRAMADA, ABIERTA, CERRADA

-- Pregunta: más tipos, dimensión, sección, obligatoria y opciones
ALTER TABLE ENCUESTA_PREGUNTA ALTER COLUMN TIPO TYPE VARCHAR(10);
-- TIPO: ACUERDO (1-5, de «totalmente en desacuerdo» a «totalmente de acuerdo»), ESCALA (1-5), ENPS (0-10), SINO,
--       UNICA (una opción), MULTIPLE (varias opciones), MATRIZ (varios ítems con la escala de acuerdo), TEXTO
ALTER TABLE ENCUESTA_PREGUNTA ADD COLUMN DIMENSION VARCHAR(16);    -- COMPROMISO, LIDERAZGO, CARGA, BIENESTAR...
ALTER TABLE ENCUESTA_PREGUNTA ADD COLUMN SECCION VARCHAR(120);
ALTER TABLE ENCUESTA_PREGUNTA ADD COLUMN OBLIGATORIA SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE ENCUESTA_PREGUNTA ADD COLUMN OPCIONES VARCHAR(2000);   -- JSON: opciones (UNICA, MULTIPLE) o ítems (MATRIZ)
ALTER TABLE ENCUESTA_PREGUNTA ALTER COLUMN TEXTO TYPE VARCHAR(400);
UPDATE ENCUESTA_PREGUNTA SET OBLIGATORIA = 0 WHERE TIPO = 'TEXTO';

-- Respuesta: un ítem por fila (la opción marcada en MULTIPLE, el ítem en MATRIZ; 0 en el resto)
ALTER TABLE ENCUESTA_RESPUESTA ADD COLUMN ITEM SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE ENCUESTA_RESPUESTA DROP CONSTRAINT encuesta_respuesta_pkey;
ALTER TABLE ENCUESTA_RESPUESTA ADD PRIMARY KEY (ENVIO, PREGUNTA, ITEM);

-- Plan de acción: lo que la empresa hace con los resultados, visible para quien recibió la encuesta
CREATE TABLE ENCUESTA_ACCION (
    ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ENCUESTA INT NOT NULL,
    DIMENSION VARCHAR(16),
    DEPARTAMENTO VARCHAR(80),              -- null: para toda la plantilla de la encuesta
    TITULO VARCHAR(160) NOT NULL,
    DESCRIPCION VARCHAR(1000),
    RESPONSABLE VARCHAR(64),               -- quién la lleva
    LIMITE DATE,
    ESTADO VARCHAR(10) NOT NULL,           -- PENDIENTE, EN_CURSO, HECHA
    AUTOR VARCHAR(64) NOT NULL,
    CREADO TIMESTAMP NOT NULL,
    ACTUALIZADO TIMESTAMP NOT NULL
);
CREATE INDEX ENCUESTA_ACCION_ENCUESTA ON ENCUESTA_ACCION (ENCUESTA);
