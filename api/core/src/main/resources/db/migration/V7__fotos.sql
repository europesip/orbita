-- ÓRBITA · Personas: foto de cada persona. En una tabla aparte para que las consultas de EMPLEADO no carguen la
-- imagen. La sube la propia persona (o RRHH); el servidor la recorta en cuadrado, la reduce a 256 px y la guarda en
-- JPEG sin metadatos (sin la ubicación ni la cámara de la foto original).
CREATE TABLE EMPLEADO_FOTO (
    USUARIO VARCHAR(64) PRIMARY KEY,
    FOTO BYTEA NOT NULL,
    TIPO VARCHAR(20) NOT NULL,             -- image/jpeg
    ACTUALIZADA TIMESTAMP NOT NULL,        -- su versión: las imágenes se guardan en caché hasta que cambia
    SUBIDA_POR VARCHAR(64) NOT NULL
);
