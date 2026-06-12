"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PRODUCTOS_SEMILLA } from "../../db";

export default function FichaCalzado({ params }) {
  const unwrappedParams = React.use(params);
  const id = unwrappedParams.id;
  
  const [producto, setProducto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tallaSel, setTallaSel] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [compraExitosa, setCompraExitosa] = useState(false);
  const [metodoPago, setMetodoPago] = useState("tarjeta");
  const [email, setEmail] = useState("");

  // Polling de sincronización en tiempo real con LocalStorage
  useEffect(() => {
    const syncDatabase = () => {
      const stored = localStorage.getItem("shoesqr_catalog");
      if (stored) {
        try {
          const catalogo = JSON.parse(stored);
          const encontrado = catalogo.find(p => p.id === id);
          if (encontrado) {
            setProducto(encontrado);
          } else {
            // Buscar en semilla si no se editó aún
            const semilla = PRODUCTOS_SEMILLA.find(p => p.id === id);
            if (semilla) setProducto(semilla);
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        // Inicializar con semilla si está vacío
        localStorage.setItem("shoesqr_catalog", JSON.stringify(PRODUCTOS_SEMILLA));
        const semilla = PRODUCTOS_SEMILLA.find(p => p.id === id);
        if (semilla) setProducto(semilla);
      }
      setLoading(false);
    };

    syncDatabase();
    const interval = setInterval(syncDatabase, 1500); // Polling cada 1.5s
    return () => clearInterval(interval);
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: "20px", color: "var(--bronze)" }}>Cargando catálogo boutique...</p>
      </div>
    );
  }

  if (!producto) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "var(--bg-primary)", gap: 20 }}>
        <h2 style={{ fontSize: "32px" }}>Modelo no encontrado</h2>
        <p style={{ color: "var(--text-secondary)" }}>El código QR escaneado no corresponde a ningún calzado activo.</p>
        <Link href="/" className="btn btn-primary">Volver al Inicio</Link>
      </div>
    );
  }

  const handleComprar = () => {
    if (!tallaSel) {
      alert("Por favor, selecciona una talla antes de continuar.");
      return;
    }
    setShowCheckout(true);
  };

  const confirmarCompra = () => {
    // Restar stock en LocalStorage
    const stored = localStorage.getItem("shoesqr_catalog");
    if (stored) {
      try {
        const catalogo = JSON.parse(stored);
        const actualizado = catalogo.map(p => {
          if (p.id === producto.id) {
            return { ...p, stock: Math.max(0, p.stock - 1) };
          }
          return p;
        });
        localStorage.setItem("shoesqr_catalog", JSON.stringify(actualizado));
      } catch (e) {
        console.error(e);
      }
    }
    setCompraExitosa(true);
  };

  const cerrarCheckout = () => {
    setShowCheckout(false);
    setCompraExitosa(false);
    setTallaSel(null);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header className="boutique-header">
        <div className="luxury-container boutique-header-inner">
          <div className="boutique-logo" style={{ cursor: "pointer" }}>
            <Link href="/">ShoesQR <span style={{ color: "var(--bronze)", fontSize: 14 }}>Boutique</span></Link>
          </div>
          <Link href="/admin" className="btn btn-secondary btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ri-settings-4-line" /> Panel Admin
          </Link>
        </div>
      </header>

      {/* Main product view */}
      <main style={{ flex: 1, padding: "50px 0" }} className="animate-fade-in">
        <div className="luxury-container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 50 }}>
          {/* Left: Product Image */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              padding: 24,
              boxShadow: "var(--shadow)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center"
            }}>
              <img 
                src={producto.imagen} 
                alt={producto.nombre} 
                style={{ width: "100%", height: "auto", maxHeight: 450, objectFit: "contain" }}
              />
            </div>
            {/* Visual reassurance badges */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: "12px", textAlign: "center", fontSize: 11, color: "var(--text-secondary)" }}>
                <i className="ri-shield-check-line" style={{ color: "var(--bronze)", fontSize: 16, display: "block", marginBottom: 4 }} />
                Autenticidad Garantizada
              </div>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: "12px", textAlign: "center", fontSize: 11, color: "var(--text-secondary)" }}>
                <i className="ri-truck-line" style={{ color: "var(--bronze)", fontSize: 16, display: "block", marginBottom: 4 }} />
                Envío Express Gratuito
              </div>
            </div>
          </div>

          {/* Right: Product Details */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <span className="badge badge-bronze" style={{ marginBottom: 12 }}>{producto.categoria}</span>
              <h1 style={{ fontSize: "40px", marginBottom: 8, fontFamily: "var(--font-display)" }}>{producto.nombre}</h1>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>SKU: {producto.sku}</p>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "20px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 }}>Precio Boutique</span>
                <span style={{ fontSize: "32px", fontFamily: "var(--font-display)", color: "var(--bronze)", fontWeight: 700 }}>
                  ${producto.precio.toLocaleString("es-MX")} <span style={{ fontSize: 14 }}>MXN</span>
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.05em" }}>Descripción del Modelo</span>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>{producto.descripcion}</p>
            </div>

            {/* Sizes selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.05em" }}>Selecciona tu Talla</span>
                <span style={{ fontSize: 11, color: "var(--bronze)" }}>Guía de tallas</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {producto.tallas.map(t => (
                  <button
                    key={t}
                    onClick={() => setTallaSel(t)}
                    style={{
                      padding: "10px 18px",
                      background: tallaSel === t ? "var(--text-primary)" : "var(--bg-card)",
                      color: tallaSel === t ? "#ffffff" : "var(--text-primary)",
                      border: `1px solid ${tallaSel === t ? "var(--text-primary)" : "var(--border)"}`,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    {t} MX
                  </button>
                ))}
              </div>
            </div>

            {/* Stock status indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: producto.stock > 0 ? "var(--success)" : "var(--danger)"
              }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
                {producto.stock > 10 ? `${producto.stock} unidades en existencia` : (producto.stock > 0 ? `¡Solo quedan ${producto.stock} piezas!` : "Agotado temporalmente")}
              </span>
            </div>

            {/* Buy Action */}
            <button 
              className="btn btn-primary" 
              onClick={handleComprar}
              disabled={producto.stock === 0}
              style={{ width: "100%", padding: "16px 0", background: producto.stock === 0 ? "var(--border)" : "var(--text-primary)", cursor: producto.stock === 0 ? "not-allowed" : "pointer" }}
            >
              <i className="ri-shopping-bag-line" style={{ marginRight: 6 }} /> Comprar Calzado
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "30px 0", backgroundColor: "#fff", marginTop: 50 }}>
        <div className="luxury-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>© 2026 ShoesQR Inc. Demo Cliente Boutique de Lujo.</span>
          <span style={{ fontSize: 11, color: "var(--bronze)" }}><i className="ri-qr-code-line" style={{ marginRight: 4 }} /> Actualizaciones instantáneas vía QR</span>
        </div>
      </footer>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="boutique-modal-overlay">
          <div className="boutique-modal" style={{ maxWidth: 450 }}>
            <div className="boutique-modal-header">
              <h3 style={{ fontSize: 18, margin: 0 }}>Simulador de Compra</h3>
              <button onClick={cerrarCheckout} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20 }}><i className="ri-close-line" /></button>
            </div>
            <div className="boutique-modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {!compraExitosa ? (
                <>
                  <div style={{ display: "flex", gap: 12, background: "var(--bg-primary)", padding: 12, border: "1px solid var(--border)" }}>
                    <img src={producto.imagen} style={{ width: 60, height: 60, objectFit: "contain" }} />
                    <div>
                      <h4 style={{ fontSize: 14 }}>{producto.nombre}</h4>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Talla: {tallaSel} MX · Cantidad: 1</div>
                      <div style={{ fontSize: 13, color: "var(--bronze)", fontWeight: 700, marginTop: 2 }}>${producto.precio.toLocaleString()} MXN</div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Correo Electrónico</label>
                    <input 
                      type="email" 
                      className="form-input" 
                      placeholder="ejemplo@cliente.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Método de Pago</label>
                    <select className="form-select" value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                      <option value="tarjeta">💳 Tarjeta de Crédito / Débito (Boutique)</option>
                      <option value="transferencia">🏦 SPEI / Transferencia Bancaria</option>
                      <option value="oxxo">🏪 Pago en Oxxo / Efectivo</option>
                    </select>
                  </div>

                  {metodoPago === "tarjeta" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div className="form-group" style={{ gridColumn: "span 2" }}>
                        <label className="form-label">Número de Tarjeta</label>
                        <input type="text" className="form-input" placeholder="XXXX XXXX XXXX XXXX" defaultValue="4152 3133 9081 2341" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Expiración</label>
                        <input type="text" className="form-input" placeholder="MM/AA" defaultValue="12/29" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">CVV</label>
                        <input type="password" className="form-input" placeholder="XXX" defaultValue="123" />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 0", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--success-subtle)", color: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 32 }}>
                    <i className="ri-checkbox-circle-fill" />
                  </div>
                  <h3 style={{ fontSize: 20 }}>¡Pedido Confirmado!</h3>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    Gracias por tu compra. Se ha enviado un correo con tu recibo de compra.
                  </p>
                  <div style={{ border: "1px dashed var(--bronze)", padding: 12, fontSize: 11, background: "var(--bronze-light)", color: "var(--text-secondary)", fontFamily: "monospace", textAlign: "left", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div><strong>TICKET DE COMPRA:</strong> #SH-{(Math.floor(100000 + Math.random() * 900000))}</div>
                    <div><strong>PRODUCTO:</strong> {producto.nombre}</div>
                    <div><strong>TALLA:</strong> {tallaSel} MX</div>
                    <div><strong>FECHA:</strong> {new Date().toLocaleString()}</div>
                    <div><strong>PAGO:</strong> {metodoPago.toUpperCase()}</div>
                    <div><strong>TOTAL:</strong> ${producto.precio.toLocaleString()} MXN</div>
                  </div>
                </div>
              )}
            </div>
            <div className="boutique-modal-footer">
              {!compraExitosa ? (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={cerrarCheckout}>Cancelar</button>
                  <button className="btn btn-primary btn-sm" onClick={confirmarCompra} disabled={!email.trim()}>Confirmar y Pagar</button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={cerrarCheckout}>Cerrar</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
