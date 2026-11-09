-- ÓRBITA · Comunicación con RRHH: comunicados con acuse de lectura, consultas a RRHH, preguntas frecuentes y pulso
-- (encuestas anónimas). Las conversaciones de las consultas usan la tabla COMENTARIO (CLASE = 'CONSULTA').

-- Comunicados de RRHH a la plantilla. AMBITO: TODOS, DEPARTAMENTO:<nombre> o ROL:<rol>.
-- CONFIRMAR = 1: cada destinatario tiene que pulsar «He leído y acepto» (acuse de lectura).
CREATE TABLE COMUNICADO (
    ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    TITULO VARCHAR(160) NOT NULL,
    TEXTO VARCHAR(8000) NOT NULL,
    CATEGORIA VARCHAR(12) NOT NULL,       -- POLITICA, AVISO, EVENTO, BENEFICIO
    AMBITO VARCHAR(80) NOT NULL,
    CONFIRMAR SMALLINT NOT NULL,
    ENLACE VARCHAR(500),                  -- documento o página relacionada (DAM, WCM...)
    LIMITE DATE,                          -- fecha límite para confirmar
    AUTOR VARCHAR(64) NOT NULL,
    PUBLICADO TIMESTAMP NOT NULL,
    ARCHIVADO SMALLINT NOT NULL DEFAULT 0
);

-- Quién ha abierto cada comunicado y quién lo ha confirmado (una fila por persona)
CREATE TABLE COMUNICADO_LECTURA (
    COMUNICADO INT NOT NULL,
    USUARIO VARCHAR(64) NOT NULL,
    LEIDO TIMESTAMP NOT NULL,
    CONFIRMADO TIMESTAMP,
    PRIMARY KEY (COMUNICADO, USUARIO)
);

-- Consultas de los empleados a RRHH. Las ven solo quien la abre y RRHH (no su responsable).
CREATE TABLE CONSULTA (
    ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    USUARIO VARCHAR(64) NOT NULL,
    CATEGORIA VARCHAR(12) NOT NULL,       -- NOMINA, CERTIFICADO, DATOS, CONTRATO, FORMACION, OTRA
    ASUNTO VARCHAR(160) NOT NULL,
    TEXTO VARCHAR(2000) NOT NULL,
    ESTADO VARCHAR(12) NOT NULL,          -- ABIERTA, EN_CURSO, RESUELTA
    ATIENDE VARCHAR(64),                  -- persona de RRHH que la lleva
    CREADO TIMESTAMP NOT NULL,
    ACTUALIZADO TIMESTAMP NOT NULL,
    RESUELTO TIMESTAMP,
    VALORACION SMALLINT                   -- 1 a 5, la pone quien preguntó al resolverse
);
CREATE INDEX CONSULTA_USUARIO ON CONSULTA (USUARIO, CREADO);

-- Preguntas frecuentes de RRHH: se sugieren antes de abrir una consulta (y las usa el asistente de IA)
CREATE TABLE PREGUNTA_FRECUENTE (
    ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CATEGORIA VARCHAR(12) NOT NULL,
    PREGUNTA VARCHAR(300) NOT NULL,
    RESPUESTA VARCHAR(2000) NOT NULL,
    ACTUALIZADO TIMESTAMP NOT NULL
);

-- Pulso: encuestas cortas y anónimas. MINIMO: respuestas necesarias para mostrar un resultado (anonimato).
CREATE TABLE ENCUESTA (
    ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    TITULO VARCHAR(160) NOT NULL,
    DESCRIPCION VARCHAR(500),
    AMBITO VARCHAR(80) NOT NULL,
    MINIMO SMALLINT NOT NULL,
    ESTADO VARCHAR(12) NOT NULL,          -- ABIERTA, CERRADA
    AUTOR VARCHAR(64) NOT NULL,
    ABIERTA TIMESTAMP NOT NULL,
    CIERRE DATE
);

CREATE TABLE ENCUESTA_PREGUNTA (
    ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ENCUESTA INT NOT NULL,
    ORDEN SMALLINT NOT NULL,
    TIPO VARCHAR(8) NOT NULL,             -- ESCALA (1 a 5), ENPS (0 a 10), TEXTO
    TEXTO VARCHAR(300) NOT NULL
);

-- Quién ha respondido, SIN sus respuestas: solo para no preguntarle dos veces
CREATE TABLE ENCUESTA_PARTICIPACION (
    ENCUESTA INT NOT NULL,
    USUARIO VARCHAR(64) NOT NULL,
    PRIMARY KEY (ENCUESTA, USUARIO)
);

-- Respuestas SIN usuario ni hora: ENVIO es un identificador aleatorio que agrupa las respuestas de un mismo envío y
-- DEPARTAMENTO permite ver los resultados por equipo (solo si responden al menos MINIMO personas)
CREATE TABLE ENCUESTA_RESPUESTA (
    ENVIO VARCHAR(36) NOT NULL,
    ENCUESTA INT NOT NULL,
    PREGUNTA INT NOT NULL,
    DEPARTAMENTO VARCHAR(80),
    VALOR SMALLINT,
    TEXTO VARCHAR(1000),
    PRIMARY KEY (ENVIO, PREGUNTA)
);
CREATE INDEX ENCUESTA_RESPUESTA_ENCUESTA ON ENCUESTA_RESPUESTA (ENCUESTA);
