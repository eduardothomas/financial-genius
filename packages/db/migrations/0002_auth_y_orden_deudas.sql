-- Liga cada usuario con su identidad del proveedor de autenticación (claim "sub" del JWT).
BEGIN;
ALTER TABLE app_user ADD COLUMN auth_subject text;
CREATE UNIQUE INDEX app_user_auth_subject_uq ON app_user(auth_subject) WHERE auth_subject IS NOT NULL;
COMMIT;

-- Conserva el orden en que el usuario ingresó sus deudas.
BEGIN;
ALTER TABLE debt ADD COLUMN position int NOT NULL DEFAULT 0;
COMMIT;
