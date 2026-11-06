-- 3.0.0: los avisos guardan una clave y sus datos (JSON) para mostrarse en el idioma de cada persona.
-- TEXTO sigue guardando el aviso en español (avisos anteriores, datos de la demo y respaldo).
ALTER TABLE AVISO ADD COLUMN CLAVE VARCHAR(40);
ALTER TABLE AVISO ADD COLUMN PARAMS VARCHAR(1000);
