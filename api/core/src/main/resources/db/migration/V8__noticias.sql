-- ÓRBITA · Portada y noticias. Las noticias publicadas viven en HCL DX WCM (biblioteca «ÓRBITA Noticias»): ÓRBITA
-- guarda solo las propuestas de la plantilla hasta que RRHH las aprueba y las publica en WCM, y sus imágenes.

-- Propuesta de noticia: la escribe cualquier persona a partir de una plantilla de WCM y la revisa RRHH
CREATE TABLE NOTICIA_PROPUESTA (
    ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    AUTOR VARCHAR(64) NOT NULL,
    PLANTILLA VARCHAR(80) NOT NULL,        -- nombre de la plantilla de autor de WCM (noticia, evento...)
    SECCION VARCHAR(80) NOT NULL,          -- nombre del área de sitio de WCM (empresa, personas...)
    TITULO VARCHAR(160) NOT NULL,
    CAMPOS TEXT NOT NULL,                  -- JSON: valor de cada elemento de la plantilla (el cuerpo, en HTML limpio)
    ESTADO VARCHAR(10) NOT NULL,           -- BORRADOR, REVISION, DEVUELTA, PUBLICADA, RECHAZADA
    COMENTARIO VARCHAR(1000),              -- de RRHH al devolverla o rechazarla
    REVISOR VARCHAR(64),
    WCM_ID VARCHAR(64),                    -- el contenido creado en WCM al publicarla
    CREADA TIMESTAMP NOT NULL,
    ACTUALIZADA TIMESTAMP NOT NULL,
    ENVIADA TIMESTAMP,
    PUBLICADA TIMESTAMP
);
CREATE INDEX NOTICIA_PROPUESTA_AUTOR ON NOTICIA_PROPUESTA (AUTOR, ACTUALIZADA);
CREATE INDEX NOTICIA_PROPUESTA_ESTADO ON NOTICIA_PROPUESTA (ESTADO, ENVIADA);

-- Imágenes de las noticias: se vuelven a dibujar en JPEG (como mucho 1600 px de ancho) sin metadatos. Las sirve
-- GET /orbita-api/v1/noticias/imagenes/{id} a quien tiene sesión; la noticia de WCM guarda esa dirección.
CREATE TABLE NOTICIA_IMAGEN (
    ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    AUTOR VARCHAR(64) NOT NULL,
    FOTO BYTEA NOT NULL,
    TIPO VARCHAR(20) NOT NULL,
    ANCHO INT NOT NULL,
    ALTO INT NOT NULL,
    CREADA TIMESTAMP NOT NULL
);
