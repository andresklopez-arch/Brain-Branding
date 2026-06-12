"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { PRODUCTOS_SEMILLA } from "../db";

export default function AdminPanel() {
  // Pestaña principal: "resumen" | "catalogo" | "inventario" | "clientes" | "reportes"
  const [adminTab, setAdminTab] = useState("resumen");
  
  const [catalog, setCatalog] = useState([]);
  const [paginated, setPaginated] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  // Estado para editor clásico
  const [editingShoe, setEditingShoe] = useState(null);
  
  // Estado para el modal del QR seleccionado
  const [selectedQR, setSelectedQR] = useState(null);
  
  // CRM, Pedidos y Devoluciones
  const [clientsList, setClientsList] = useState([]);
  const [ordersList, setOrdersList] = useState([]);
  const [returnsLog, setReturnsLog] = useState([]);
  
  // Filtros de fecha para reportes (últimos 30 días por defecto)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Cargador de fotos/excel/pdf
  const [uploadTab, setUploadTab] = useState("photo");
  const [excelText, setExcelText] = useState("");
  const [photoSelected, setPhotoSelected] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [pdfFileName, setPdfFileName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(-1);
  
  // Selección de etiquetas para impresión masiva
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [showLabelPrint, setShowLabelPrint] = useState(false);

  // Formularios manuales VIP / Nuevo calzado / Devolución
  const [vipName, setVipName] = useState("");
  const [vipPhone, setVipPhone] = useState("");
  const [vipEmail, setVipEmail] = useState("");

  const [newShoeSku, setNewShoeSku] = useState("");
  const [newShoeNombre, setNewShoeNombre] = useState("");
  const [newShoeCategoria, setNewShoeCategoria] = useState("Sport / Sneaker");
  const [newShoePrecio, setNewShoePrecio] = useState("");
  const [newShoeStock, setNewShoeStock] = useState("");
  const [newShoeDesc, setNewShoeDesc] = useState("");
  const [newShoeFecha, setNewShoeFecha] = useState(() => new Date().toISOString().split("T")[0]);

  const [retSku, setRetSku] = useState("");
  const [retQty, setRetQty] = useState(1);
  const [retReason, setRetReason] = useState("Talla incorrecta");

  const fileInputRef = useRef(null);

  // Inicializar 2000 modelos
  useEffect(() => {
    const generate2000Shoes = (seed) => {
      const list = [...seed];
      const categories = ["Sport / Sneaker", "Casual / Mocasín", "Formal / Oxford", "Botas", "Sandalias"];
      const names = ["Aurelia", "Vanguard", "Scarlet", "Heritage", "Verona", "Apex", "Florence", "Monaco", "Milano", "Capri"];
      const styles = ["Premium", "Classic", "Carbon", "Obsidian", "Satin", "Suede", "Velvet", "Leather", "Veloce", "Street"];
      
      for (let i = seed.length + 1; i <= 2000; i++) {
        const cat = categories[i % categories.length];
        const name = `${names[i % names.length]} ${styles[(i * 3) % styles.length]} ${100 + i}`;
        
        // Generar fecha de ingreso en los últimos 60 días
        const daysAgo = i % 60;
        const entryDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        list.push({
          id: `model-${i}`,
          sku: `SH-M${i.toString().padStart(4, "0")}`,
          nombre: name,
          categoria: cat,
          precio: 2200 + ((i * 17) % 8000),
          stock: (i * 7) % 95,
          tallas: [23, 24, 25, 26, 27].slice(0, 1 + (i % 5)),
          imagen: seed[i % seed.length].imagen,
          caracteristicas: "Diseñado para confort exclusivo, costuras artesanales de alta costura.",
          descripcion: `Modelo premium número ${i} de nuestra línea boutique, elaborado con materiales selectos para una durabilidad e imagen impecables.`,
          fechaIngreso: entryDate
        });
      }
      return list;
    };

    const stored = localStorage.getItem("shoesqr_catalog");
    if (stored) {
      try {
        const list = JSON.parse(stored);
        if (list.length < 2000) {
          const filled = generate2000Shoes(PRODUCTOS_SEMILLA);
          localStorage.setItem("shoesqr_catalog", JSON.stringify(filled));
          setCatalog(filled);
        } else {
          setCatalog(list);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      const filled = generate2000Shoes(PRODUCTOS_SEMILLA);
      localStorage.setItem("shoesqr_catalog", JSON.stringify(filled));
      setCatalog(filled);
    }
  }, []);

  // Polling para sincronización local en tiempo real de CRM, pedidos y catálogo
  useEffect(() => {
    const syncData = () => {
      // Catálogo
      const storedCatalog = localStorage.getItem("shoesqr_catalog");
      if (storedCatalog) {
        try {
          setCatalog(JSON.parse(storedCatalog));
        } catch (e) {}
      }

      // Clientes
      const storedClients = localStorage.getItem("shoesqr_clients");
      if (storedClients) {
        try {
          setClientsList(JSON.parse(storedClients));
        } catch (e) {}
      }

      // Pedidos
      const storedOrders = localStorage.getItem("shoesqr_orders");
      if (storedOrders) {
        try {
          setOrdersList(JSON.parse(storedOrders));
        } catch (e) {}
      }

      // Devoluciones
      const storedReturns = localStorage.getItem("shoesqr_returns");
      if (storedReturns) {
        try {
          setReturnsLog(JSON.parse(storedReturns));
        } catch (e) {}
      }
    };

    syncData();
    const interval = setInterval(syncData, 1500);
    return () => clearInterval(interval);
  }, []);

  // Filtrado y búsqueda
  const filteredCatalog = catalog.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.categoria.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || p.categoria.includes(categoryFilter);
    return matchesSearch && matchesCategory;
  });

  // Paginación
  useEffect(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setPaginated(filteredCatalog.slice(startIndex, endIndex));
  }, [catalog, searchTerm, categoryFilter, currentPage]);

  const totalPages = Math.ceil(filteredCatalog.length / itemsPerPage);

  // Guardar cambios clásicos de edición
  const saveShoeChanges = (e) => {
    e.preventDefault();
    const updated = catalog.map(p => p.id === editingShoe.id ? editingShoe : p);
    setCatalog(updated);
    localStorage.setItem("shoesqr_catalog", JSON.stringify(updated));
    setEditingShoe(null);
    alert(`Modelo ${editingShoe.nombre} actualizado con éxito.`);
  };

  // Guardar cambios rápidos desde el modal de QR
  const saveQRQuickEdit = (updatedShoe) => {
    const updated = catalog.map(p => p.id === updatedShoe.id ? updatedShoe : p);
    setCatalog(updated);
    localStorage.setItem("shoesqr_catalog", JSON.stringify(updated));
    setSelectedQR(updatedShoe);
    alert(`Cambios rápidos para ${updatedShoe.nombre} aplicados.`);
  };

  // Copiar link de QR al portapapeles
  const copiarLinkQR = (id) => {
    const url = `${window.location.origin}/calzado/${id}`;
    navigator.clipboard.writeText(url);
    alert("Enlace copiado al portapapeles: " + url);
  };

  // Descarga simulada de QR
  const descargarQR = (shoe) => {
    const element = document.createElement("a");
    const file = new Blob([`ShoesQR Boutique - Ficha del Calzado\nSKU: ${shoe.sku}\nNombre: ${shoe.nombre}\nURL: ${window.location.origin}/calzado/${shoe.id}`], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${shoe.sku}_QR_Label.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Registrar devolución
  const registrarDevolucion = (e) => {
    e.preventDefault();
    if (!retSku.trim()) return;

    // Buscar calzado por SKU
    const shoe = catalog.find(p => p.sku.toLowerCase() === retSku.trim().toLowerCase());
    if (!shoe) {
      alert("Error: No se encontró ningún calzado con el SKU especificado.");
      return;
    }

    const qty = parseInt(retQty) || 1;

    // Actualizar stock
    const updatedCatalog = catalog.map(p => {
      if (p.id === shoe.id) {
        return { ...p, stock: p.stock + qty };
      }
      return p;
    });
    setCatalog(updatedCatalog);
    localStorage.setItem("shoesqr_catalog", JSON.stringify(updatedCatalog));

    // Agregar a la bitácora de devoluciones
    const nowStr = new Date().toISOString();
    const newReturn = {
      returnId: `RET-${Math.floor(100000 + Math.random() * 900000)}`,
      sku: shoe.sku,
      nombre: shoe.nombre,
      cantidad: qty,
      fecha: nowStr,
      motivo: retReason
    };
    
    const updatedReturns = [newReturn, ...returnsLog];
    setReturnsLog(updatedReturns);
    localStorage.setItem("shoesqr_returns", JSON.stringify(updatedReturns));

    // Resetear formulario
    setRetSku("");
    setRetQty(1);
    setRetReason("Talla incorrecta");
    alert(`¡Devolución exitosa! Se devolvieron ${qty} piezas al stock del calzado ${shoe.nombre}.`);
  };

  // Registrar nuevo calzado de forma manual
  const registrarNuevoCalzado = (e) => {
    e.preventDefault();
    if (!newShoeSku || !newShoeNombre || !newShoePrecio || !newShoeStock) {
      alert("Por favor, llena los campos requeridos (*).");
      return;
    }

    // Verificar SKU duplicado
    if (catalog.some(p => p.sku.toLowerCase() === newShoeSku.trim().toLowerCase())) {
      alert("Error: El SKU ya está registrado.");
      return;
    }

    const id = `manual-${Date.now()}`;
    const nuevo = {
      id,
      sku: newShoeSku.trim().toUpperCase(),
      nombre: newShoeNombre.trim(),
      categoria: newShoeCategoria,
      precio: parseFloat(newShoePrecio),
      stock: parseInt(newShoeStock),
      tallas: [24, 25, 26, 27],
      imagen: "/assets/leather_shoe.png", // imagen por defecto
      caracteristicas: "Ingresado manualmente en el sistema de inventarios.",
      descripcion: newShoeDesc.trim() || "Modelo de calzado premium agregado vía menú de inventarios de administración.",
      fechaIngreso: newShoeFecha
    };

    const updated = [nuevo, ...catalog];
    setCatalog(updated);
    localStorage.setItem("shoesqr_catalog", JSON.stringify(updated));

    // Limpiar campos
    setNewShoeSku("");
    setNewShoeNombre("");
    setNewShoePrecio("");
    setNewShoeStock("");
    setNewShoeDesc("");
    alert(`Calzado ${nuevo.nombre} agregado con éxito al inventario.`);
  };

  // Registrar cliente VIP manual
  const registrarClienteManual = (e) => {
    e.preventDefault();
    if (!vipName || !vipPhone || !vipEmail) {
      alert("Todos los campos del cliente VIP son requeridos.");
      return;
    }

    if (clientsList.some(c => c.telefono === vipPhone.trim())) {
      alert("Este número de teléfono ya está registrado.");
      return;
    }

    const nowStr = new Date().toISOString();
    const nuevoVIP = {
      nombre: vipName.trim(),
      telefono: vipPhone.trim(),
      email: vipEmail.trim(),
      comprasCount: 0,
      gastoTotal: 0,
      fechaIngreso: nowStr,
      fechaUltima: "N/A"
    };

    const updated = [nuevoVIP, ...clientsList];
    setClientsList(updated);
    localStorage.setItem("shoesqr_clients", JSON.stringify(updated));

    setVipName("");
    setVipPhone("");
    setVipEmail("");
    alert(`Cliente VIP ${nuevoVIP.nombre} registrado correctamente.`);
  };

  // Procesar carga de Excel masiva
  const procesarExcel = () => {
    if (!excelText.trim()) return;
    const rows = excelText.split("\n");
    const newProducts = [];
    rows.forEach(r => {
      const cols = r.split(";");
      if (cols.length >= 5) {
        const id = `custom-${Date.now()}-${Math.floor(Math.random() * 100)}`;
        newProducts.push({
          id,
          sku: cols[0].trim().toUpperCase(),
          nombre: cols[1].trim(),
          categoria: cols[2].trim(),
          precio: parseFloat(cols[3].trim()) || 3500,
          stock: parseInt(cols[4].trim()) || 10,
          tallas: [23, 24, 25, 26],
          imagen: "/assets/designer_loafer.png",
          caracteristicas: "Modelo importado en lote via Excel.",
          descripcion: "Calzado de lujo cargado dinámicamente en lote para pruebas de catálogo masivo.",
          fechaIngreso: new Date().toISOString().split("T")[0]
        });
      }
    });
    
    if (newProducts.length > 0) {
      const updated = [...newProducts, ...catalog];
      setCatalog(updated);
      localStorage.setItem("shoesqr_catalog", JSON.stringify(updated));
      setExcelText("");
      alert(`¡Carga exitosa! Se agregaron ${newProducts.length} nuevos modelos al catálogo.`);
    }
  };

  // Carga por Foto
  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhotoSelected(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const subirFotoSimulada = () => {
    if (!photoSelected) return;
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            const id = `photo-${Date.now()}`;
            const nuevo = {
              id,
              sku: `SH-PH${Math.floor(1000 + Math.random() * 9000)}`,
              nombre: "Zapatilla Sport Vanguard IA",
              categoria: "Sport / Sneaker",
              precio: 4200,
              stock: 25,
              tallas: [24, 25, 26, 27],
              imagen: "/assets/luxury_sneaker.png",
              caracteristicas: "Identificado por IA a través de fotografía.",
              descripcion: "Calzado identificado por fotografía en el cargador dinámico. Atributos auto-rellenados por reconocimiento visual.",
              fechaIngreso: new Date().toISOString().split("T")[0]
            };
            const updated = [nuevo, ...catalog];
            setCatalog(updated);
            localStorage.setItem("shoesqr_catalog", JSON.stringify(updated));
            setPhotoSelected(null);
            setPhotoPreview(null);
            setUploadProgress(-1);
            alert("¡Reconocimiento de Foto Exitoso! Se detectó un tenis deportivo y se cargó al catálogo.");
          }, 500);
          return 100;
        }
        return prev + 25;
      });
    }, 400);
  };

  // Carga por PDF
  const subirPdfSimulado = () => {
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            const nuevos = [
              {
                id: `pdf-1-${Date.now()}`,
                sku: "SH-PDF-91",
                nombre: "Oxford Imperial Satin",
                categoria: "Formal",
                precio: 7900,
                stock: 12,
                tallas: [25, 26, 27],
                imagen: "/assets/leather_shoe.png",
                caracteristicas: "Importado de PDF Catálogo Otoño.",
                descripcion: "Modelo formal importado vía análisis de catálogo PDF.",
                fechaIngreso: new Date().toISOString().split("T")[0]
              },
              {
                id: `pdf-2-${Date.now()}`,
                sku: "SH-PDF-92",
                nombre: "Bota Outback Carbon",
                categoria: "Botas",
                precio: 5200,
                stock: 18,
                tallas: [25, 26, 27, 28],
                imagen: "/assets/leather_boot.png",
                caracteristicas: "Importado de PDF Catálogo Otoño.",
                descripcion: "Modelo bota de cuero importado de catálogo digital PDF.",
                fechaIngreso: new Date().toISOString().split("T")[0]
              }
            ];
            const updated = [...nuevos, ...catalog];
            setCatalog(updated);
            localStorage.setItem("shoesqr_catalog", JSON.stringify(updated));
            setPdfFileName("");
            setUploadProgress(-1);
            alert("¡Análisis de PDF Exitoso! Se leyeron y cargaron 2 modelos de calzado del documento.");
          }, 500);
          return 100;
        }
        return prev + 20;
      });
    }, 300);
  };

  const toggleLabelSelect = (id) => {
    if (selectedLabels.includes(id)) {
      setSelectedLabels(selectedLabels.filter(x => x !== id));
    } else {
      setSelectedLabels([...selectedLabels, id]);
    }
  };

  const seleccionarTodos = () => {
    if (selectedLabels.length === paginated.length) {
      setSelectedLabels([]);
    } else {
      setSelectedLabels(paginated.map(p => p.id));
    }
  };

  // Filtrado de reportes por fecha
  const filteredOrders = ordersList.filter(o => {
    const oDate = o.fecha.split("T")[0];
    return oDate >= startDate && oDate <= endDate;
  });

  // KPIs de Reportes
  const totalReporteVentas = filteredOrders.reduce((sum, o) => sum + o.precio, 0);
  const ticketPromedioReporte = filteredOrders.length > 0 ? (totalReporteVentas / filteredOrders.length) : 0;
  const totalArticulosReporte = filteredOrders.length;

  // KPIs de Catálogo General
  const totalModelos = catalog.length;
  const sinStock = catalog.filter(p => p.stock === 0).length;
  const valorInventario = catalog.reduce((sum, p) => sum + (p.precio * p.stock), 0);
  const totalEscaneosSimulados = 5420 + ordersList.length * 4; // incremento dinámico

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      {/* Sticky Header */}
      <header className="boutique-header">
        <div className="luxury-container boutique-header-inner" style={{ height: "90px" }}>
          <div className="boutique-logo">
            <Link href="/">ShoesQR <span style={{ color: "var(--bronze)", fontSize: 13, letterSpacing: "0.05em" }}>Admin</span></Link>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link href="/" className="btn btn-secondary btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ri-logout-box-r-line" /> Ir a Bienvenida
            </Link>
          </div>
        </div>
      </header>

      {/* Admin Content Container */}
      <div className="luxury-container animate-fade-in" style={{ padding: "40px 0", display: "flex", flexDirection: "column", gap: 20 }}>
        
        {/* Navigation Tabs bar */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          marginBottom: 10,
          overflowX: "auto",
          gap: 10
        }}>
          {[
            { id: "resumen", label: "Resumen", icon: "ri-dashboard-line" },
            { id: "catalogo", label: "Catálogo", icon: "ri-list-check-2" },
            { id: "inventario", label: "Inventarios", icon: "ri-archive-line" },
            { id: "clientes", label: "Clientes", icon: "ri-group-line" },
            { id: "reportes", label: "Reportes", icon: "ri-bar-chart-box-line" },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              className={`welcome-tab-btn ${adminTab === t.id ? "active" : ""}`}
              onClick={() => setAdminTab(t.id)}
              style={{ padding: "15px 24px", fontSize: 13, flex: "none" }}
            >
              <i className={t.icon} style={{ marginRight: 6 }} /> {t.label}
            </button>
          ))}
        </div>

        {/* 1. SECCIÓN: RESUMEN / DASHBOARD */}
        {adminTab === "resumen" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
              <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Modelos en Catálogo</span>
                <h3 style={{ fontSize: 28, marginTop: 8 }}>{totalModelos.toLocaleString()}</h3>
              </div>
              <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Sin Existencias</span>
                <h3 style={{ fontSize: 28, marginTop: 8, color: "var(--danger)" }}>{sinStock}</h3>
              </div>
              <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Valor del Inventario</span>
                <h3 style={{ fontSize: 28, marginTop: 8, color: "var(--bronze)" }}>${valorInventario.toLocaleString()} <span style={{ fontSize: 11 }}>MXN</span></h3>
              </div>
              <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Escaneos e Interacciones QR</span>
                <h3 style={{ fontSize: 28, marginTop: 8, color: "var(--success)" }}>{totalEscaneosSimulados.toLocaleString()}</h3>
              </div>
            </div>

            {/* Loaders Panel */}
            <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 30, boxShadow: "var(--shadow)" }}>
              <h2 style={{ fontSize: 18, marginBottom: 20, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                <i className="ri-upload-cloud-line" style={{ marginRight: 8, color: "var(--bronze)" }} />
                Carga Dinámica Masiva de Calzado
              </h2>
              
              <div style={{ display: "flex", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 20 }}>
                <button type="button" className={`btn btn-sm ${uploadTab === "photo" ? "btn-primary" : "btn-secondary"}`} onClick={() => setUploadTab("photo")}>📷 Foto IA</button>
                <button type="button" className={`btn btn-sm ${uploadTab === "excel" ? "btn-primary" : "btn-secondary"}`} onClick={() => setUploadTab("excel")}>📄 Excel / CSV</button>
                <button type="button" className={`btn btn-sm ${uploadTab === "pdf" ? "btn-primary" : "btn-secondary"}`} onClick={() => setUploadTab("pdf")}>📕 Catálogo PDF</button>
              </div>

              {uploadProgress >= 0 && (
                <div style={{ marginBottom: 20, background: "var(--bg-primary)", padding: 12, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    <span>PROCESANDO ARCHIVO...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ width: "100%", height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${uploadProgress}%`, height: "100%", background: "var(--bronze)", transition: "width 0.3s" }} />
                  </div>
                </div>
              )}

              {uploadTab === "photo" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 24, alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sube una foto del calzado para el auto-reconocimiento por Inteligencia Artificial.</span>
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoSelect} style={{ display: "none" }} />
                    <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>Seleccionar Foto</button>
                  </div>
                  <div>
                    {photoPreview ? (
                      <div style={{ display: "flex", gap: 16, alignItems: "center", border: "1px solid var(--border)", padding: 16 }}>
                        <img src={photoPreview} style={{ width: 100, height: 100, objectFit: "cover" }} />
                        <button type="button" className="btn btn-primary btn-sm" onClick={subirFotoSimulada}>Comenzar Carga Foto</button>
                      </div>
                    ) : <div style={{ height: 100, border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>Sin imagen seleccionada.</div>}
                  </div>
                </div>
              )}

              {uploadTab === "excel" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Pega filas en formato: <code>SKU;Nombre;Categoría;Precio;Stock</code></span>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ padding: "4px 8px" }} onClick={() => setExcelText("SH-EX-01;Tacón Scarlet Gold;Sandalias;3900;14\nSH-EX-02;Mocasín Classic Bronze;Casual;2800;19")}>Pegar Ejemplo</button>
                  </div>
                  <textarea className="form-textarea" rows={4} value={excelText} onChange={e => setExcelText(e.target.value)} style={{ fontFamily: "monospace", fontSize: 12 }} />
                  <button type="button" className="btn btn-primary" onClick={procesarExcel} disabled={!excelText.trim()}>Cargar en Lote</button>
                </div>
              )}

              {uploadTab === "pdf" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 24, alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Analiza catálogos digitales PDF de calzado para cargar existencias masivas.</span>
                    <button type="button" className="btn btn-secondary" onClick={() => setPdfFileName("Catálogo_Otoño_ShoesQR.pdf")}>Simular Carga PDF</button>
                  </div>
                  <div>
                    {pdfFileName ? (
                      <div style={{ display: "flex", gap: 16, alignItems: "center", border: "1px solid var(--border)", padding: 16 }}>
                        <div style={{ fontSize: 32, color: "var(--danger)" }}><i className="ri-file-pdf-fill" /></div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700 }}>{pdfFileName}</div>
                          <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={subirPdfSimulado}>Analizar PDF</button>
                        </div>
                      </div>
                    ) : <div style={{ height: 100, border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>Sin archivo cargado.</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. SECCIÓN: CATÁLOGO DE CALZADO */}
        {adminTab === "catalogo" && (
          <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 30, boxShadow: "var(--shadow)" }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, fontWeight: 700, textTransform: "uppercase" }}>Catálogo General de Calzado (2,000 Modelos)</h2>
            
            {/* Filters */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 280 }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Buscar calzado (Nombre, SKU, Categoría)..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  style={{ flex: 1 }}
                />
                <select className="form-select" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }}>
                  <option value="all">Todas las Categorías</option>
                  <option value="Sport">Sport</option>
                  <option value="Casual">Casual / Mocasín</option>
                  <option value="Formal">Formal / Oxford</option>
                  <option value="Botas">Botas</option>
                  <option value="Sandalias">Sandalias</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={seleccionarTodos} disabled={paginated.length === 0}>
                  {selectedLabels.length === paginated.length ? "Deseleccionar" : "Seleccionar Página"}
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowLabelPrint(true)} disabled={selectedLabels.length === 0} style={{ background: "var(--bronze)" }}>
                  <i className="ri-printer-line" /> Imprimir QR ({selectedLabels.length})
                </button>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", color: "var(--text-secondary)", textAlign: "left" }}>
                    <th style={{ padding: "12px 8px" }}></th>
                    <th style={{ padding: "12px 8px" }}>Foto</th>
                    <th style={{ padding: "12px 8px" }}>SKU</th>
                    <th style={{ padding: "12px 8px" }}>Nombre</th>
                    <th style={{ padding: "12px 8px" }}>Categoría</th>
                    <th style={{ padding: "12px 8px" }}>Precio</th>
                    <th style={{ padding: "12px 8px" }}>Existencia</th>
                    <th style={{ padding: "12px 8px" }}>QR Ficha (Clic para Menú)</th>
                    <th style={{ padding: "12px 8px" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>Sin resultados.</td></tr>
                  ) : (
                    paginated.map(p => {
                      const qrUrl = typeof window !== "undefined" ? `${window.location.origin}/calzado/${p.id}` : "";
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "12px 8px" }}><input type="checkbox" checked={selectedLabels.includes(p.id)} onChange={() => toggleLabelSelect(p.id)} /></td>
                          <td style={{ padding: "12px 8px" }}><img src={p.imagen} style={{ width: 40, height: 40, objectFit: "contain", background: "var(--bg-primary)" }} /></td>
                          <td style={{ padding: "12px 8px", fontFamily: "monospace" }}>{p.sku}</td>
                          <td style={{ padding: "12px 8px", fontWeight: 600 }}>{p.nombre}</td>
                          <td style={{ padding: "12px 8px" }}>{p.categoria}</td>
                          <td style={{ padding: "12px 8px", color: "var(--bronze)", fontWeight: 700 }}>${p.precio.toLocaleString()} MXN</td>
                          <td style={{ padding: "12px 8px" }}>
                            <span className={`badge ${p.stock > 0 ? "badge-success" : "badge-danger"}`}>{p.stock} piezas</span>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            {qrUrl && (
                              <div 
                                onClick={() => setSelectedQR(p)}
                                style={{ padding: 4, background: "#fff", display: "inline-block", border: "1px solid var(--border)", cursor: "pointer", transition: "transform 0.2s" }}
                                title="Haga clic para abrir menú de opciones del QR"
                                className="shoe-img-wrapper"
                              >
                                <QRCodeSVG value={qrUrl} size={30} />
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <Link href={`/calzado/${p.id}`} target="_blank" className="btn btn-icon btn-sm"><i className="ri-external-link-line" /></Link>
                              <button type="button" className="btn btn-icon btn-sm" onClick={() => setEditingShoe(p)}><i className="ri-pencil-line" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Pág. {currentPage} de {totalPages}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>Primero</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>Anterior</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>Siguiente</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>Último</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. SECCIÓN: INVENTARIOS (COMPLETOS) */}
        {adminTab === "inventario" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: 30 }}>
            {/* Almacén de Existencias y Alertas */}
            <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 30, boxShadow: "var(--shadow)" }}>
              <h2 style={{ fontSize: 18, marginBottom: 20, fontWeight: 700, textTransform: "uppercase" }}>Existencias y Alertas de Stock</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)", color: "var(--text-secondary)", textAlign: "left" }}>
                      <th style={{ padding: "10px 8px" }}>SKU</th>
                      <th style={{ padding: "10px 8px" }}>Calzado</th>
                      <th style={{ padding: "10px 8px" }}>Fecha Ingreso</th>
                      <th style={{ padding: "10px 8px" }}>Estado Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.slice(0, 15).map(p => {
                      const isCritical = p.stock < 5;
                      const isLow = p.stock < 15;
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 8px", fontFamily: "monospace" }}>{p.sku}</td>
                          <td style={{ padding: "10px 8px", fontWeight: 600 }}>{p.nombre}</td>
                          <td style={{ padding: "10px 8px" }}>{p.fechaIngreso || "2026-05-15"}</td>
                          <td style={{ padding: "10px 8px" }}>
                            {p.stock === 0 ? (
                              <span className="badge badge-danger">Agotado (0)</span>
                            ) : isCritical ? (
                              <span className="badge badge-danger" style={{ background: "#fef2f2", color: "#ef4444" }}>Crítico ({p.stock} uds)</span>
                            ) : isLow ? (
                              <span className="badge badge-bronze">Bajo ({p.stock} uds)</span>
                            ) : (
                              <span className="badge badge-success">{p.stock} piezas</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 15 }}>* Se muestran los primeros 15 modelos. Edite stock o busque en Catálogo para modificar a gran escala.</p>
            </div>

            {/* Formulario de Carga Manual y Devoluciones */}
            <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
              
              {/* Devoluciones */}
              <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
                <h3 style={{ fontSize: 16, marginBottom: 16, fontWeight: 700, textTransform: "uppercase" }}><i className="ri-refund-2-line" style={{ marginRight: 6 }} /> Registrar Devolución</h3>
                <form onSubmit={registrarDevolucion} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">SKU del Calzado *</label>
                    <input type="text" className="form-input" placeholder="Ej. SH-AURE-01" value={retSku} onChange={e => setRetSku(e.target.value)} required />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Cantidad *</label>
                      <input type="number" className="form-input" min={1} value={retQty} onChange={e => setRetQty(parseInt(e.target.value) || 1)} required />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Motivo *</label>
                      <select className="form-select" value={retReason} onChange={e => setRetReason(e.target.value)}>
                        <option value="Talla incorrecta">Talla incorrecta</option>
                        <option value="Defecto de fábrica">Defecto de fábrica</option>
                        <option value="Insatisfacción de color">Insatisfacción de color</option>
                        <option value="Pedido errado">Pedido errado</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-secondary btn-sm" style={{ width: "100%", marginTop: 6 }}>Aplicar e Incrementar Stock</button>
                </form>

                {returnsLog.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Historial de Devoluciones</span>
                    <div style={{ maxHeight: 120, overflowY: "auto", marginTop: 8, border: "1px solid var(--border)", fontSize: 11 }}>
                      {returnsLog.map(r => (
                        <div key={r.returnId} style={{ padding: 6, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                          <span><strong>{r.sku}</strong> ({r.cantidad} u) - {r.motivo}</span>
                          <span style={{ color: "var(--text-muted)" }}>{r.fecha.split("T")[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Registro Manual de Producto */}
              <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
                <h3 style={{ fontSize: 16, marginBottom: 16, fontWeight: 700, textTransform: "uppercase" }}><i className="ri-add-box-line" style={{ marginRight: 6 }} /> Carga Manual de Producto</h3>
                <form onSubmit={registrarNuevoCalzado} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">SKU *</label>
                      <input type="text" className="form-input" placeholder="Ej. SH-NEW-99" value={newShoeSku} onChange={e => setNewShoeSku(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Fecha Ingreso *</label>
                      <input type="date" className="form-input" value={newShoeFecha} onChange={e => setNewShoeFecha(e.target.value)} required />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Nombre del Calzado *</label>
                    <input type="text" className="form-input" placeholder="Ej. Oxford Imperial Satin" value={newShoeNombre} onChange={e => setNewShoeNombre(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Categoría *</label>
                    <select className="form-select" value={newShoeCategoria} onChange={e => setNewShoeCategoria(e.target.value)}>
                      <option value="Sport / Sneaker">Sport / Sneaker</option>
                      <option value="Casual / Mocasín">Casual / Mocasín</option>
                      <option value="Formal / Oxford">Formal / Oxford</option>
                      <option value="Botas">Botas</option>
                      <option value="Sandalias">Sandalias</option>
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Precio *</label>
                      <input type="number" className="form-input" placeholder="Precio MXN" value={newShoePrecio} onChange={e => setNewShoePrecio(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Stock *</label>
                      <input type="number" className="form-input" placeholder="Piezas" value={newShoeStock} onChange={e => setNewShoeStock(e.target.value)} required />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Descripción</label>
                    <input type="text" className="form-input" placeholder="Descripción breve" value={newShoeDesc} onChange={e => setNewShoeDesc(e.target.value)} />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ width: "100%", marginTop: 8 }}>Ingresar a Inventario</button>
                </form>
              </div>

            </div>
          </div>
        )}

        {/* 4. SECCIÓN: CLIENTES VIP / CRM */}
        {adminTab === "clientes" && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 30 }}>
            {/* Listado de Clientes */}
            <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 30, boxShadow: "var(--shadow)" }}>
              <h2 style={{ fontSize: 18, marginBottom: 20, fontWeight: 700, textTransform: "uppercase" }}>Cartera de Clientes Registrados</h2>
              
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)", color: "var(--text-secondary)", textAlign: "left" }}>
                      <th style={{ padding: "12px 8px" }}>Nombre</th>
                      <th style={{ padding: "12px 8px" }}>Teléfono</th>
                      <th style={{ padding: "12px 8px" }}>Correo</th>
                      <th style={{ padding: "12px 8px" }}>Compras</th>
                      <th style={{ padding: "12px 8px" }}>Gasto Total</th>
                      <th style={{ padding: "12px 8px" }}>Última Compra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientsList.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>Ningún cliente registrado en compras o VIP manual.</td></tr>
                    ) : (
                      clientsList.map((c, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "12px 8px", fontWeight: 600 }}>{c.nombre}</td>
                          <td style={{ padding: "12px 8px", fontFamily: "monospace" }}>{c.telefono}</td>
                          <td style={{ padding: "12px 8px" }}>{c.email}</td>
                          <td style={{ padding: "12px 8px" }}>
                            <span className="badge badge-bronze" style={{ background: "var(--bronze-light)" }}>{c.comprasCount} compra(s)</span>
                          </td>
                          <td style={{ padding: "12px 8px", color: "var(--bronze)", fontWeight: 700 }}>${c.gastoTotal.toLocaleString()} MXN</td>
                          <td style={{ padding: "12px 8px", fontSize: 11 }}>{c.fechaUltima !== "N/A" ? c.fechaUltima.split("T")[0] : "N/A"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Registro de Cliente VIP */}
            <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
              <h3 style={{ fontSize: 16, marginBottom: 16, fontWeight: 700, textTransform: "uppercase" }}><i className="ri-user-add-line" style={{ marginRight: 6 }} /> Registrar Cliente VIP</h3>
              <form onSubmit={registrarClienteManual} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nombre Completo *</label>
                  <input type="text" className="form-input" placeholder="Ej. Juan Pérez" value={vipName} onChange={e => setVipName(e.target.value)} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Número Telefónico *</label>
                  <input type="tel" className="form-input" placeholder="Ej. 5512345678" value={vipPhone} onChange={e => setVipPhone(e.target.value)} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Correo Electrónico *</label>
                  <input type="email" className="form-input" placeholder="VIP@cliente.com" value={vipEmail} onChange={e => setVipEmail(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary btn-sm" style={{ width: "100%", marginTop: 6 }}>Crear Perfil Cliente VIP</button>
              </form>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 15 }}>* Registrar manualmente a un cliente permite tener listos sus datos y registrar compras por teléfono o boutique física.</p>
            </div>
          </div>
        )}

        {/* 5. SECCIÓN: REPORTES DE VENTAS POR FECHAS */}
        {adminTab === "reportes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            {/* Selector de Fechas */}
            <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 20, boxShadow: "var(--shadow)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, textTransform: "uppercase" }}>Buscador de Ventas por Fechas</h3>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Selecciona el rango de fechas para calcular el reporte de pedidos boutique.</span>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>Desde</label>
                  <input type="date" className="form-input" style={{ padding: "6px 12px", fontSize: 12 }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>Hasta</label>
                  <input type="date" className="form-input" style={{ padding: "6px 12px", fontSize: 12 }} value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
            </div>

            {/* KPIs del Rango */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
              <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Ventas del Período</span>
                <h3 style={{ fontSize: 26, marginTop: 8, color: "var(--bronze)" }}>${totalReporteVentas.toLocaleString()} MXN</h3>
              </div>
              <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Artículos Vendidos</span>
                <h3 style={{ fontSize: 26, marginTop: 8 }}>{totalArticulosReporte} piezas</h3>
              </div>
              <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Ticket Promedio</span>
                <h3 style={{ fontSize: 26, marginTop: 8 }}>${ticketPromedioReporte.toLocaleString()} MXN</h3>
              </div>
            </div>

            {/* Listado de Pedidos en Rango */}
            <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 30, boxShadow: "var(--shadow)" }}>
              <h2 style={{ fontSize: 18, marginBottom: 20, fontWeight: 700, textTransform: "uppercase" }}>Detalle de Pedidos Realizados</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)", color: "var(--text-secondary)", textAlign: "left" }}>
                      <th style={{ padding: "12px 8px" }}>Pedido ID</th>
                      <th style={{ padding: "12px 8px" }}>Fecha</th>
                      <th style={{ padding: "12px 8px" }}>Cliente</th>
                      <th style={{ padding: "12px 8px" }}>Calzado SKU</th>
                      <th style={{ padding: "12px 8px" }}>Talla</th>
                      <th style={{ padding: "12px 8px" }}>Monto</th>
                      <th style={{ padding: "12px 8px" }}>Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>Ningún pedido registrado en este rango de fechas.</td></tr>
                    ) : (
                      filteredOrders.map((o, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "12px 8px", fontWeight: "bold", fontFamily: "monospace" }}>{o.orderId}</td>
                          <td style={{ padding: "12px 8px" }}>{o.fecha.split("T")[0]} {o.fecha.split("T")[1]?.slice(0, 5)}</td>
                          <td style={{ padding: "12px 8px" }}>
                            <div style={{ fontWeight: 600 }}>{o.clienteNombre}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{o.clienteTelefono}</div>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <div>{o.productoNombre}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{o.productoSku}</div>
                          </td>
                          <td style={{ padding: "12px 8px" }}>{o.talla} MX</td>
                          <td style={{ padding: "12px 8px", color: "var(--bronze)", fontWeight: 700 }}>${o.precio.toLocaleString()} MXN</td>
                          <td style={{ padding: "12px 8px", textTransform: "uppercase", fontSize: 11 }}>{o.metodoPago}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Editor Modal Clásico */}
      {editingShoe && (
        <div className="boutique-modal-overlay">
          <form className="boutique-modal" style={{ maxWidth: 450 }} onSubmit={saveShoeChanges}>
            <div className="boutique-modal-header">
              <h3 style={{ fontSize: 18, margin: 0 }}>Editar Calzado</h3>
              <button type="button" onClick={() => setEditingShoe(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20 }}><i className="ri-close-line" /></button>
            </div>
            <div className="boutique-modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 12, background: "var(--bg-primary)", padding: 12, border: "1px solid var(--border)" }}>
                <img src={editingShoe.imagen} style={{ width: 50, height: 50, objectFit: "contain" }} />
                <div>
                  <h4 style={{ fontSize: 13 }}>{editingShoe.nombre}</h4>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>SKU: {editingShoe.sku}</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Precio Boutique (MXN)</label>
                <input type="number" className="form-input" value={editingShoe.precio} onChange={e => setEditingShoe({ ...editingShoe, precio: parseFloat(e.target.value) || 0 })} min={1} required />
              </div>
              <div className="form-group">
                <label className="form-label">Stock en Existencia</label>
                <input type="number" className="form-input" value={editingShoe.stock} onChange={e => setEditingShoe({ ...editingShoe, stock: parseInt(e.target.value) || 0 })} min={0} required />
              </div>
              <div className="form-group">
                <label className="form-label">Características Principales</label>
                <input type="text" className="form-input" value={editingShoe.caracteristicas} onChange={e => setEditingShoe({ ...editingShoe, caracteristicas: e.target.value })} />
              </div>
            </div>
            <div className="boutique-modal-footer">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingShoe(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm">Guardar Cambios</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL INTERACTIVO DE CÓDIGO QR (Al hacer clic en el QR en la tabla) */}
      {selectedQR && (
        <div className="boutique-modal-overlay">
          <div className="boutique-modal" style={{ maxWidth: 500 }}>
            <div className="boutique-modal-header">
              <h3 style={{ fontSize: 18, margin: 0 }}>Gestión de Código QR del Calzado</h3>
              <button type="button" onClick={() => setSelectedQR(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20 }}><i className="ri-close-line" /></button>
            </div>
            <div className="boutique-modal-body" style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 20, alignItems: "center" }}>
              {/* Lado Izquierdo: Etiqueta física para caja */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", border: "1px solid var(--border)", padding: 16, background: "#fff" }}>
                <QRCodeSVG value={`${typeof window !== "undefined" ? window.location.origin : ""}/calzado/${selectedQR.id}`} size={110} />
                <span style={{ fontSize: 11, fontWeight: "bold", textTransform: "uppercase", color: "var(--bronze)" }}>ShoesQR Label</span>
                <span style={{ fontSize: 10, fontFamily: "monospace" }}>SKU: {selectedQR.sku}</span>
              </div>

              {/* Lado Derecho: Menú de Acciones */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h4 style={{ fontSize: 15, fontFamily: "var(--font-sans)", fontWeight: 700, color: "var(--text-primary)" }}>{selectedQR.nombre}</h4>
                
                {/* Modificar Precio Rápido */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)" }}>Precio Boutique</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input 
                      type="number" 
                      className="form-input" 
                      style={{ padding: "6px 10px", fontSize: 12, flex: 1 }} 
                      value={selectedQR.precio} 
                      onChange={e => setSelectedQR({ ...selectedQR, precio: parseFloat(e.target.value) || 0 })} 
                    />
                    <button type="button" className="btn btn-secondary btn-sm" style={{ padding: "6px 12px" }} onClick={() => saveQRQuickEdit(selectedQR)}>Guardar</button>
                  </div>
                </div>

                {/* Modificar Stock Rápido */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)" }}>Existencias en Stock</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input 
                      type="number" 
                      className="form-input" 
                      style={{ padding: "6px 10px", fontSize: 12, flex: 1 }} 
                      value={selectedQR.stock} 
                      onChange={e => setSelectedQR({ ...selectedQR, stock: parseInt(e.target.value) || 0 })} 
                    />
                    <button type="button" className="btn btn-secondary btn-sm" style={{ padding: "6px 12px" }} onClick={() => saveQRQuickEdit(selectedQR)}>Guardar</button>
                  </div>
                </div>

                {/* Menú de Botones sugeridos */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                  <button type="button" className="btn btn-bronze btn-sm" style={{ padding: "8px" }} onClick={() => { setSelectedQR(null); setShowLabelPrint(true); setSelectedLabels([selectedQR.id]); }} title="Imprimir esta etiqueta">
                    <i className="ri-printer-line" /> Imprimir
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: "8px" }} onClick={() => copiarLinkQR(selectedQR.id)} title="Copiar enlace de compra">
                    <i className="ri-file-copy-line" /> Enlace
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: "8px" }} onClick={() => descargarQR(selectedQR)} title="Descargar archivo del QR">
                    <i className="ri-download-line" /> Descargar
                  </button>
                  <Link href={`/calzado/${selectedQR.id}`} target="_blank" className="btn btn-secondary btn-sm" style={{ padding: "8px", display: "inline-flex", justifyContent: "center", alignItems: "center" }} title="Ver catálogo del cliente">
                    <i className="ri-external-link-line" /> Ver Ficha
                  </Link>
                </div>
              </div>
            </div>
            <div className="boutique-modal-footer">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSelectedQR(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Label Print Modal Masivo */}
      {showLabelPrint && (
        <div className="boutique-modal-overlay">
          <div className="boutique-modal" style={{ maxWidth: 650 }}>
            <div className="boutique-modal-header">
              <h3 style={{ fontSize: 18, margin: 0 }}>Vista de Impresión de Etiquetas QR</h3>
              <button type="button" onClick={() => { setShowLabelPrint(false); setSelectedLabels([]); }} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20 }}><i className="ri-close-line" /></button>
            </div>
            <div className="boutique-modal-body" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {catalog.filter(p => selectedLabels.includes(p.id)).map(p => {
                  const qrUrl = typeof window !== "undefined" ? `${window.location.origin}/calzado/${p.id}` : "";
                  return (
                    <div key={p.id} style={{ border: "1px solid #000", padding: 16, display: "flex", gap: 12, background: "#fff", alignItems: "center", fontFamily: "monospace" }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: "bold", textTransform: "uppercase" }}>ShoesQR Boutique</div>
                        <div style={{ fontSize: 12, fontWeight: "bold" }}>{p.nombre}</div>
                        <div style={{ fontSize: 10 }}>SKU: {p.sku}</div>
                        <div style={{ fontSize: 10 }}>Categoría: {p.categoria}</div>
                        <div style={{ fontSize: 11, fontWeight: "bold", color: "var(--bronze)", marginTop: 4 }}>${p.precio.toLocaleString()} MXN</div>
                      </div>
                      <div style={{ padding: 6, border: "1px solid #000" }}>
                        <QRCodeSVG value={qrUrl} size={70} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="boutique-modal-footer">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowLabelPrint(false); setSelectedLabels([]); }}>Cerrar</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}><i className="ri-printer-line" /> Imprimir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
