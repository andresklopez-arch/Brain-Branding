"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PRODUCTOS_SEMILLA } from "./db";

export default function HomePage() {
  const [catalog, setCatalog] = useState([]);
  const [hasEnteredClient, setHasEnteredClient] = useState(false);
  const [welcomeTab, setWelcomeTab] = useState("cliente"); // "cliente" | "admin"

  // Sincronizar catálogo y verificar si ya ingresó en la sesión actual
  useEffect(() => {
    const stored = localStorage.getItem("shoesqr_catalog");
    if (stored) {
      try {
        setCatalog(JSON.parse(stored).slice(0, 8)); // Mostrar los destacados
      } catch (e) {
        setCatalog(PRODUCTOS_SEMILLA.slice(0, 8));
      }
    } else {
      localStorage.setItem("shoesqr_catalog", JSON.stringify(PRODUCTOS_SEMILLA));
      setCatalog(PRODUCTOS_SEMILLA.slice(0, 8));
    }

  }, []);

  const enterAsClient = () => {
    setHasEnteredClient(true);
  };

  const exitClient = () => {
    setHasEnteredClient(false);
  };

  // VISTA 1: Pantalla de Bienvenida (Gateway)
  if (!hasEnteredClient) {
    return (
      <div className="welcome-container animate-fade-in">
        <div className="welcome-bg-decoration" />
        <div className="welcome-card">
          <div className="welcome-logo">
            ShoesQR <span style={{ color: "var(--bronze)" }}>Boutique</span>
          </div>
          <div className="welcome-subtitle">Plataforma de Calzado Inteligente</div>

          {/* Dos Pestañas de Bienvenida */}
          <div className="welcome-tabs">
            <button
              type="button"
              className={`welcome-tab-btn ${welcomeTab === "cliente" ? "active" : ""}`}
              onClick={() => setWelcomeTab("cliente")}
            >
              <i className="ri-user-line" /> Cliente
            </button>
            <Link
              href="/admin"
              className={`welcome-tab-btn ${welcomeTab === "admin" ? "active" : ""}`}
              style={{ textDecoration: "none" }}
            >
              <i className="ri-settings-4-line" /> Administrador
            </Link>
          </div>

          {/* Panel según pestaña activa */}
          {welcomeTab === "cliente" ? (
            <div className="welcome-panel">
              <h3 className="welcome-panel-title">Portal de Clientes</h3>
              <p className="welcome-panel-desc">
                Explore nuestra colección exclusiva de calzado de lujo, consulte características y stock en tiempo real mediante simulación de escaneo de etiquetas QR.
              </p>
              <button
                type="button"
                className="btn btn-bronze animate-pulse-gold"
                onClick={enterAsClient}
                style={{ width: "100%", padding: "14px", marginTop: 10 }}
              >
                Ingresar como Cliente <i className="ri-arrow-right-line" style={{ marginLeft: 6 }} />
              </button>
            </div>
          ) : (
            <div className="welcome-panel">
              <h3 className="welcome-panel-title">Portal de Administración</h3>
              <p className="welcome-panel-desc">
                Acceso restringido para personal. Gestione precios, existencias y descargue plantillas de códigos QR listos para imprimir para 2,000+ modelos.
              </p>
              <Link
                href="/admin"
                className="btn btn-primary"
                style={{ width: "100%", padding: "14px", marginTop: 10, display: "flex", justifyContent: "center", alignItems: "center" }}
              >
                Ingresar como Administrador <i className="ri-shield-user-line" style={{ marginLeft: 6 }} />
              </Link>
            </div>
          )}

          <div className="welcome-footer-tag">
            <i className="ri-qr-code-line" style={{ color: "var(--bronze)" }} /> YoY Scratch Studio
          </div>
        </div>
      </div>
    );
  }

  // VISTA 2: Portal del Cliente (Catálogo)
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Sticky Header with Mode Switcher Links */}
      <header className="boutique-header">
        <div className="luxury-container boutique-header-inner" style={{ height: "90px" }}>
          <div className="boutique-logo">
            <Link href="/" onClick={exitClient}>ShoesQR <span style={{ color: "var(--bronze)", fontSize: 13, letterSpacing: "0.05em" }}>Boutique</span></Link>
          </div>

          {/* Mode switch navigation linking to pages */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 15
          }}>
            <div style={{
              display: "flex",
              background: "var(--bg-primary)",
              border: "1px solid var(--border)",
              padding: 4,
              borderRadius: 0
            }}>
              <button
                type="button"
                onClick={() => {}}
                style={{
                  background: "var(--text-primary)",
                  color: "#fff",
                  padding: "8px 20px",
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  display: "inline-flex",
                  alignItems: "center",
                  border: "none",
                  cursor: "default"
                }}
              >
                <i className="ri-user-line" style={{ marginRight: 6 }} /> Vista Cliente
              </button>
              <Link
                href="/admin"
                style={{
                  background: "transparent",
                  color: "var(--text-secondary)",
                  padding: "8px 20px",
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  display: "inline-flex",
                  alignItems: "center"
                }}
              >
                <i className="ri-settings-4-line" style={{ marginRight: 6 }} /> Vista Administrador
              </Link>
            </div>

            {/* Botón de Salir para regresar a la pantalla de bienvenida */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={exitClient}
              style={{ padding: "8px 12px", fontSize: "11px", display: "inline-flex", alignItems: "center" }}
              title="Volver a la portada de bienvenida"
            >
              <i className="ri-logout-box-r-line" style={{ marginRight: 6 }} /> Salir
            </button>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section style={{ 
        backgroundImage: "linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.25)), url('/assets/luxury_sneaker.png')", 
        backgroundSize: "cover", 
        backgroundPosition: "center", 
        height: "400px", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        color: "#fff", 
        textAlign: "center" 
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 650, padding: 24, background: "rgba(25, 25, 25, 0.45)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)" }} className="animate-fade-in">
          <h1 style={{ fontSize: "40px", color: "#fff", fontFamily: "var(--font-display)", fontWeight: 700 }}>Catálogo Boutique QR</h1>
          <p style={{ fontSize: "13px", fontWeight: 300, letterSpacing: "0.1em" }}>
            ESCANEA EL CÓDIGO QR DE CUALQUIER CALZADO PARA VER SU DETALLE O COMPRAR AL INSTANTE.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8 }}>
            <Link href="/admin" className="btn btn-bronze btn-sm">Ir al Administrador</Link>
            <a href="#catalogo-cliente" className="btn btn-secondary btn-sm" style={{ color: "#fff", borderColor: "#fff" }}>Ver Modelos</a>
          </div>
        </div>
      </section>

      {/* Featured items */}
      <section id="catalogo-cliente" style={{ padding: "60px 0", flex: 1 }} className="animate-fade-in">
        <div className="luxury-container">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 }}>Modelos Disponibles</span>
            <h2 style={{ fontSize: "32px", marginTop: 8 }}>Calzado Boutique de Lujo</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>Haz clic en un modelo para simular el escaneo del código QR físico.</p>
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
                    <h3 style={{ fontSize: 17, marginTop: 4 }}>{p.nombre}</h3>
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
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "30px 0", backgroundColor: "#fff" }}>
        <div className="luxury-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>© 2026 ShoesQR Inc. Demo Cliente Boutique de Lujo. Todos los derechos reservados.</span>
          <span style={{ fontSize: 11, color: "var(--bronze)", fontWeight: 600 }}><i className="ri-qr-code-line" style={{ marginRight: 4 }} /> YoY Scratch Studio</span>
        </div>
      </footer>
    </div>
  );
}
