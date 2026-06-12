"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PRODUCTOS_SEMILLA } from "./db";

export default function HomePage() {
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem("shoesqr_catalog");
    if (stored) {
      try {
        setCatalog(JSON.parse(stored).slice(0, 6)); // Mostrar los 6 primeros destacados
      } catch (e) {
        setCatalog(PRODUCTOS_SEMILLA.slice(0, 6));
      }
    } else {
      localStorage.setItem("shoesqr_catalog", JSON.stringify(PRODUCTOS_SEMILLA));
      setCatalog(PRODUCTOS_SEMILLA.slice(0, 6));
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header className="boutique-header">
        <div className="luxury-container boutique-header-inner">
          <div className="boutique-logo">
            <Link href="/">ShoesQR <span style={{ color: "var(--bronze)", fontSize: 14 }}>Boutique</span></Link>
          </div>
          <Link href="/admin" className="btn btn-primary btn-sm">
            <i className="ri-settings-4-line" /> Panel Admin
          </Link>
        </div>
      </header>

      {/* Hero Banner */}
      <section style={{ 
        backgroundImage: "linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.25)), url('/assets/luxury_sneaker.png')", 
        backgroundSize: "cover", 
        backgroundPosition: "center", 
        height: "450px", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        color: "#fff", 
        textAlign: "center" 
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 650, padding: 24, background: "rgba(25, 25, 25, 0.45)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)" }} className="animate-fade-in">
          <h1 style={{ fontSize: "44px", color: "#fff", fontFamily: "var(--font-display)" }}>ShoesQR Boutique</h1>
          <p style={{ fontSize: "14px", fontWeight: 300, letterSpacing: "0.1em" }}>
            EL FUTURO DEL COMERCIO DE CALZADO A GRAN ESCALA MEDIANTE CÓDIGOS QR INTELIGENTES.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8 }}>
            <Link href="/admin" className="btn btn-bronze btn-sm">Gestionar Catálogo</Link>
            <a href="#destacados" className="btn btn-secondary btn-sm" style={{ color: "#fff", borderColor: "#fff" }}>Ver Modelos de Prueba</a>
          </div>
        </div>
      </section>

      {/* Brand Value Section */}
      <section style={{ padding: "60px 0", backgroundColor: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div className="luxury-container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 30, textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 24, color: "var(--bronze)", marginBottom: 8 }}><i className="ri-qr-code-line" /></div>
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>Actualización Instantánea vía QR</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Olvídate de cambiar precios de forma manual en tus tiendas físicas o catálogos impresos. Actualiza el stock o precio en el sistema y se reflejará de inmediato cuando tus clientes escaneen el calzado.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 24, color: "var(--bronze)", marginBottom: 8 }}><i className="ri-database-2-line" /></div>
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>Catálogo Masivo</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Diseñado para desplazar inventarios a gran escala. El demo simula un catálogo premium precargado de **2,000 modelos** de calzado con paginación optimizada.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 24, color: "var(--bronze)", marginBottom: 8 }}><i className="ri-upload-2-line" /></div>
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>Cargas Dinámicas y Exportación</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Importa colecciones en lote mediante arrastrar archivos de Excel, PDF de catálogo o fotos con auto-reconocimiento por IA, y exporta etiquetas QR listas para pegar en las cajas de zapatos.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section id="destacados" style={{ flex: 1, padding: "80px 0" }}>
        <div className="luxury-container">
          <div style={{ textAlign: "center", marginBottom: 50 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 }}>Colección Exclusiva</span>
            <h2 style={{ fontSize: "36px", marginTop: 8 }}>Modelos Destacados de Demostración</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>Haz clic en cualquier modelo para simular el escaneo del código QR por parte de un cliente.</p>
          </div>

          <div className="shoes-grid">
            {catalog.map(p => (
              <div key={p.id} className="shoe-card">
                <div className="shoe-img-wrapper">
                  <img src={p.imagen} alt={p.nombre} className="shoe-img" />
                </div>
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                  <div>
                    <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>{p.categoria}</span>
                    <h3 style={{ fontSize: 18, marginTop: 4 }}>{p.nombre}</h3>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--bronze)" }}>${p.precio.toLocaleString()} MXN</span>
                    <Link href={`/calzado/${p.id}`} className="btn btn-secondary btn-sm" style={{ padding: "6px 12px", fontSize: 11 }}>
                      Escanear QR <i className="ri-arrow-right-line" style={{ marginLeft: 4 }} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 50 }}>
            <Link href="/admin" className="btn btn-primary">
              Ir al Panel Administrador para ver los 2,000 modelos
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "40px 0", backgroundColor: "#fff" }}>
        <div className="luxury-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>© 2026 ShoesQR Inc. Demo Cliente Boutique de Lujo. Todos los derechos reservados.</span>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/admin" style={{ fontSize: 12, color: "var(--text-secondary)" }}>Administrador</Link>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>|</span>
            <span style={{ fontSize: 12, color: "var(--bronze)", fontWeight: 600 }}>Desarrollado en YoY Scratch Studio</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
