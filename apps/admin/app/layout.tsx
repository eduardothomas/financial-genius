import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Catálogo · Financial Genius' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header>
          <strong>Financial Genius · Catálogo</strong>
          <a href="/">Productos</a>
          <a href="/propuestas">Propuestas</a>
          <a href="/importar">Importar desde URL</a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
