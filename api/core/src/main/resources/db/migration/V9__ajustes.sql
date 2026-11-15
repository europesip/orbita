-- ÓRBITA · Ajustes: preferencias de cada persona y ajustes de la empresa (USUARIO = '*'). Por ahora, el diseño de la
-- portada: RRHH elige el de toda la empresa y cada persona puede elegir otro para ella.
CREATE TABLE AJUSTE (
    USUARIO VARCHAR(64) NOT NULL,          -- '*' = de toda la empresa
    CLAVE VARCHAR(40) NOT NULL,            -- portada.diseno
    VALOR VARCHAR(200) NOT NULL,
    CAMBIADO TIMESTAMP NOT NULL,
    CAMBIADO_POR VARCHAR(64) NOT NULL,
    PRIMARY KEY (USUARIO, CLAVE)
);
