-- ÓRBITA · Personas: directorio de la plantilla, organigrama, perfil de cada persona y reconocimientos entre
-- compañeros. La ficha de empleado (EMPLEADO) gana los datos de contacto y de perfil; el organigrama sale de
-- EMPLEADO.RESPONSABLE, que ya existía.

-- Datos de contacto y organización: los mantiene RRHH (EMAIL, SEDE, INCORPORACION) o la propia persona (el resto)
ALTER TABLE EMPLEADO ADD COLUMN EMAIL VARCHAR(160);
ALTER TABLE EMPLEADO ADD COLUMN TELEFONO VARCHAR(40);
ALTER TABLE EMPLEADO ADD COLUMN EXTENSION VARCHAR(12);
ALTER TABLE EMPLEADO ADD COLUMN SEDE VARCHAR(80);
ALTER TABLE EMPLEADO ADD COLUMN UBICACION VARCHAR(80);       -- planta, zona o puesto dentro de la sede
ALTER TABLE EMPLEADO ADD COLUMN INCORPORACION DATE;          -- para los aniversarios en la empresa
-- Perfil: lo escribe cada persona
ALTER TABLE EMPLEADO ADD COLUMN SOBRE_MI VARCHAR(600);
ALTER TABLE EMPLEADO ADD COLUMN HABILIDADES VARCHAR(700);    -- separadas por comas (como mucho 15)
ALTER TABLE EMPLEADO ADD COLUMN IDIOMAS VARCHAR(200);
ALTER TABLE EMPLEADO ADD COLUMN CUMPLEANOS VARCHAR(5);       -- MM-DD, sin año
ALTER TABLE EMPLEADO ADD COLUMN CUMPLE_VISIBLE SMALLINT NOT NULL DEFAULT 0;   -- solo se muestra si la persona quiere

-- Reconocimientos entre compañeros («gracias por...»): públicos para toda la plantilla
CREATE TABLE RECONOCIMIENTO (
    ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    DE VARCHAR(64) NOT NULL,
    PARA VARCHAR(64) NOT NULL,
    VALOR VARCHAR(12) NOT NULL,           -- EQUIPO, CLIENTE, IDEA, AYUDA, LOGRO
    TEXTO VARCHAR(300) NOT NULL,
    CREADO TIMESTAMP NOT NULL
);
CREATE INDEX RECONOCIMIENTO_PARA ON RECONOCIMIENTO (PARA, CREADO);
