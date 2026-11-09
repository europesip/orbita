-- ÓRBITA · Mis documentos: la documentación de cada empleado. La empresa (RRHH y Administración) publica nóminas,
-- informes de cotización, certificados de retenciones, contratos y certificados; el empleado los descarga y, si se le
-- pide, firma el «recibí». El empleado también envía documentos suyos a RRHH (justificantes, titulaciones...), que RRHH
-- revisa. Su responsable no ve nada de esto.

CREATE TABLE DOCUMENTO (
    ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    USUARIO VARCHAR(64) NOT NULL,          -- de quién es el documento
    ORIGEN VARCHAR(8) NOT NULL,            -- EMPRESA (lo publica RRHH o Administración) o EMPLEADO (lo envía a RRHH)
    CATEGORIA VARCHAR(12) NOT NULL,        -- EMPRESA: NOMINA, COTIZACION, RETENCIONES, CONTRATO, CERTIFICADO, OTRO
                                           -- EMPLEADO: JUSTIFICANTE, TITULACION, BANCARIO, PERSONAL, OTRO
    TITULO VARCHAR(160) NOT NULL,
    PERIODO VARCHAR(7),                    -- AAAA-MM (nóminas, cotizaciones) o AAAA (retenciones); null si no aplica
    NOMBRE VARCHAR(160) NOT NULL,          -- nombre del fichero
    TIPO VARCHAR(60) NOT NULL,             -- application/pdf, image/jpeg, image/png
    TAMANO INT NOT NULL,
    FICHERO BYTEA NOT NULL,
    COMENTARIO VARCHAR(500),
    SUBIDO_POR VARCHAR(64) NOT NULL,
    CREADO TIMESTAMP NOT NULL,
    PIDE_ACUSE SMALLINT NOT NULL DEFAULT 0, -- 1: el empleado tiene que firmar el «recibí»
    LEIDO TIMESTAMP,                       -- primera vez que lo abre su dueño
    ACUSE TIMESTAMP,                       -- «recibí» firmado
    ESTADO VARCHAR(10),                    -- solo los del EMPLEADO: PENDIENTE, REVISADO, RECHAZADO
    REVISADO_POR VARCHAR(64),
    REVISADO TIMESTAMP,
    COMENTARIO_RRHH VARCHAR(500)
);
CREATE INDEX DOCUMENTO_USUARIO ON DOCUMENTO (USUARIO, ORIGEN, CREADO);

-- Importes de cada nómina (céntimos): con ellos se ve el año de un vistazo y la IA responde «¿cuánto cobré en octubre?»
CREATE TABLE NOMINA (
    DOCUMENTO INT PRIMARY KEY,
    BRUTO INT NOT NULL,
    IRPF INT NOT NULL,                     -- retención de IRPF
    SS INT NOT NULL,                       -- cotización del trabajador a la Seguridad Social
    OTRAS INT NOT NULL DEFAULT 0,          -- otras deducciones (anticipos, embargos...)
    NETO INT NOT NULL,                     -- líquido a percibir
    EXTRA SMALLINT NOT NULL DEFAULT 0      -- 1: paga extraordinaria
);
