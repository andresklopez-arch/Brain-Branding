import "./globals.css";

export const metadata = {
  title: "ShoesQR Boutique - Catálogo Inteligente",
  description: "Exclusivo catálogo de calzado de lujo gestionado en tiempo real a través de códigos QR inteligentes.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
