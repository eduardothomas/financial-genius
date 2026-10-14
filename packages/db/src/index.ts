/**
 * Interfaz mínima de acceso a datos. En producción la implementa `pg` (Pool);
 * en pruebas, `psqlDb` (ver ./testing.js). Así la lógica no depende del driver.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
