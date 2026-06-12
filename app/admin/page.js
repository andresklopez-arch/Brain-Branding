"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { PRODUCTOS_SEMILLA } from "../db";

export default function AdminPanel() {
  const [catalog, setCatalog] = useState([]);
  const [paginated, setPaginated] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  // Estados para editor de calzado
  const [editingShoe, setEditingShoe] = useState(null);
  
  // Estados de carga de archivos
  const [uploadTab, setUploadTab] = useState("photo"); // 'photo' | 'excel' | 'pdf'
  const [excelText, setExcelText] = useState("");
  const [photoSelected, setPhotoSelected] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [pdfFileName, setPdfFileName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(-1); // -1 = no activo
  
  // Estado para visor de etiquetas para impresión
  const [selectedLabels, setSelectedLabels] = useState([]); // Array de ids
  const [showLabelPrint, setShowLabelPrint] = useState(false);

  const fileInputRef = useRef(null);

  // Inicializar o sincronizar catálogo de 2000 modelos en LocalStorage
  useEffect(() => {
    const generate2000Shoes = (seed) => {
      const list = [...seed];
      const categories = ["Sport / Sneaker", "Casual / Mocasín", "Formal / Oxford", "Botas", "Sandalias"];
      const names = ["Aurelia", "Vanguard", "Scarlet", "Heritage", "Verona", "Apex", "Florence", "Monaco", "Milano", "Capri"];
      const styles = ["Premium", "Classic", "Carbon", "Obsidian", "Satin", "Suede", "Velvet", "Leather", "Veloce", "Street"];
      
      for (let i = seed.length + 1; i <= 2000; i++) {
        const cat = categories[i % categories.length];
        const name = `${names[i % names.length]} ${styles[(i * 3) % styles.length]} ${100 + i}`;
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
          descripcion: `Modelo premium número ${i} de nuestra línea boutique, elaborado con materiales selectos para una durabilidad e imagen impecables.`
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

  const saveShoeChanges = (e) => {
    e.preventDefault();
    const updated = catalog.map(p => p.id === editingShoe.id ? editingShoe : p);
    setCatalog(updated);
    localStorage.setItem("shoesqr_catalog", JSON.stringify(updated));
    setEditingShoe(null);
    alert(`Modelo ${editingShoe.nombre} actualizado vía QR con éxito.`);
  };

  // Carga por Excel
  const prellenarExcel = () => {
    setExcelText(
      "SH-CUST-99;Royal Oxford Bronze;Formal;8500;15\n" +
      "SH-CUST-98;Stellar Sport Carbon;Sport;4900;30\n" +
      "SH-CUST-97;Sandalia Capri Gold;Sandalias;2900;10"
    );
  };

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
          sku: cols[0].trim(),
          nombre: cols[1].trim(),
          categoria: cols[2].trim(),
          precio: parseFloat(cols[3].trim()) || 3500,
          stock: parseInt(cols[4].trim()) || 10,
          tallas: [23, 24, 25, 26],
          imagen: "/assets/designer_loafer.png", // default
          caracteristicas: "Modelo importado en lote via Excel.",
          descripcion: "Calzado de lujo cargado dinámicamente en lote para pruebas de catálogo masivo."
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
              nombre: "Calzado Importado Foto X",
              categoria: "Sport / Sneaker",
              precio: 4200,
              stock: 25,
              tallas: [24, 25, 26, 27],
              imagen: "/assets/luxury_sneaker.png",
              caracteristicas: "Identificado por IA a través de imagen.",
              descripcion: "Calzado identificado por fotografía. Atributos autocompletados mediante reconocimiento visual del catálogo."
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
                descripcion: "Modelo formal importado vía análisis de catálogo PDF."
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
                descripcion: "Modelo bota de cuero importado de catálogo digital PDF."
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

  // Manejar selección de etiquetas
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

  // Estadísticas del catálogo
  const totalModelos = catalog.length;
  const sinStock = catalog.filter(p => p.stock === 0).length;
  const valorInventario = catalog.reduce((sum, p) => sum + (p.precio * p.stock), 0);
  const escanesSimulados = 5420;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      {/* Header */}
      <header className="boutique-header">
        <div className="luxury-container boutique-header-inner">
          <div className="boutique-logo">
            <Link href="/">ShoesQR <span style={{ color: "var(--bronze)", fontSize: 14 }}>Admin</span></Link>
          </div>
          <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Boutique Catalog Manager v1.0
          </span>
        </div>
      </header>

      {/* Admin Content */}
      <div className="luxury-container" style={{ padding: "40px 0", display: "flex", flexDirection: "column", gap: 30 }} className="animate-fade-in">
        
        {/* Dashboard KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
          <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow)" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Modelos Registrados</span>
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
            <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Escaneos QR Totales</span>
            <h3 style={{ fontSize: 28, marginTop: 8, color: "var(--success)" }}>{escanesSimulados.toLocaleString()}</h3>
          </div>
        </div>

        {/* Carga Masiva (Loader Menu) */}
        <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 30, boxShadow: "var(--shadow)" }}>
          <h2 style={{ fontSize: 18, marginBottom: 20, fontFamily: "var(--font-sans)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            <i className="ri-upload-cloud-line" style={{ marginRight: 8, color: "var(--bronze)" }} />
            Menú de Carga Dinámica de Calzado
          </h2>
          
          <div style={{ display: "flex", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 20 }}>
            <button 
              className={`btn btn-sm ${uploadTab === "photo" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setUploadTab("photo")}
            >
              📷 Foto de Calzado
            </button>
            <button 
              className={`btn btn-sm ${uploadTab === "excel" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setUploadTab("excel")}
            >
              📄 Copiar Excel / CSV
            </button>
            <button 
              className={`btn btn-sm ${uploadTab === "pdf" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setUploadTab("pdf")}
            >
              📕 Importar Catálogo PDF
            </button>
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
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Sube una foto del calzado. Nuestro sistema de reconocimiento inteligente identificará el tipo de calzado, SKU inicial y llenará los datos automáticamente.
                </span>
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  onChange={handlePhotoSelect} 
                  style={{ display: "none" }} 
                />
                <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>
                  <i className="ri-image-add-line" /> Seleccionar Fotografía
                </button>
              </div>
              <div>
                {photoPreview ? (
                  <div style={{ display: "flex", gap: 16, alignItems: "center", border: "1px solid var(--border)", padding: 16 }}>
                    <img src={photoPreview} style={{ width: 100, height: 100, objectFit: "cover" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{photoSelected.name}</span>
                      <button className="btn btn-primary btn-sm" onClick={subirFotoSimulada}>
                        Comenzar Reconocimiento IA
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ height: 130, border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
                    Sin foto seleccionada.
                  </div>
                )}
              </div>
            </div>
          )}

          {uploadTab === "excel" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Pega filas separadas por punto y coma con el formato: <code>SKU;Nombre;Categoría;Precio;Stock</code>.
                </span>
                <button className="btn btn-secondary btn-sm" onClick={prellenarExcel} style={{ padding: "4px 8px" }}>
                  Pegar Ejemplo
                </button>
              </div>
              <textarea 
                className="form-textarea" 
                rows={4} 
                placeholder="Ejemplo: SH-90;Zapatilla Diamante;Tacón;9800;10"
                value={excelText}
                onChange={e => setExcelText(e.target.value)}
                style={{ fontFamily: "monospace", fontSize: 12 }}
              />
              <button className="btn btn-primary" onClick={procesarExcel} disabled={!excelText.trim()}>
                Cargar en Lote
              </button>
            </div>
          )}

          {uploadTab === "pdf" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 24, alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Arrastra o selecciona un archivo PDF con la colección de calzado. La herramienta extraerá los modelos, SKU, precios y stock automáticamente.
                </span>
                <button className="btn btn-secondary" onClick={() => setPdfFileName("Catalogo_Calzado_Otono2026.pdf")}>
                  <i className="ri-file-pdf-line" /> Seleccionar Archivo PDF
                </button>
              </div>
              <div>
                {pdfFileName ? (
                  <div style={{ display: "flex", gap: 16, alignItems: "center", border: "1px solid var(--border)", padding: 16 }}>
                    <div style={{ fontSize: 36, color: "var(--danger)" }}><i className="ri-file-pdf-fill" /></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{pdfFileName}</span>
                      <button className="btn btn-primary btn-sm" onClick={subirPdfSimulado}>
                        Analizar e Importar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ height: 130, border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
                    Ningún catálogo PDF cargado.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Catalog List Management */}
        <div style={{ background: "#fff", border: "1px solid var(--border)", padding: 30, boxShadow: "var(--shadow)" }}>
          
          {/* Filters and search */}
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
              <select 
                className="form-select"
                value={categoryFilter}
                onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="all">Todas las Categorías</option>
                <option value="Sport">Sport</option>
                <option value="Casual">Casual / Mocasín</option>
                <option value="Formal">Formal / Oxford</option>
                <option value="Botas">Botas</option>
                <option value="Sandalias">Sandalias</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={seleccionarTodos}
                disabled={paginated.length === 0}
              >
                {selectedLabels.length === paginated.length ? "Deseleccionar" : "Seleccionar Página"}
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => setShowLabelPrint(true)}
                disabled={selectedLabels.length === 0}
                style={{ background: "var(--bronze)" }}
              >
                <i className="ri-printer-line" /> Imprimir QR ({selectedLabels.length})
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", color: "var(--text-secondary)" }}>
                  <th style={{ padding: "12px 8px" }}></th>
                  <th style={{ padding: "12px 8px" }}>Foto</th>
                  <th style={{ padding: "12px 8px" }}>SKU</th>
                  <th style={{ padding: "12px 8px" }}>Nombre</th>
                  <th style={{ padding: "12px 8px" }}>Categoría</th>
                  <th style={{ padding: "12px 8px" }}>Precio</th>
                  <th style={{ padding: "12px 8px" }}>Existencia</th>
                  <th style={{ padding: "12px 8px" }}>QR Ficha</th>
                  <th style={{ padding: "12px 8px" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                      Ningún calzado coincide con los criterios de búsqueda.
                    </td>
                  </tr>
                ) : (
                  paginated.map(p => {
                    const qrUrl = typeof window !== "undefined" ? `${window.location.origin}/calzado/${p.id}` : "";
                    
                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 8px" }}>
                          <input 
                            type="checkbox" 
                            checked={selectedLabels.includes(p.id)}
                            onChange={() => toggleLabelSelect(p.id)}
                          />
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <img src={p.imagen} style={{ width: 40, height: 40, objectFit: "contain", background: "var(--bg-primary)" }} />
                        </td>
                        <td style={{ padding: "12px 8px", fontFamily: "monospace" }}>{p.sku}</td>
                        <td style={{ padding: "12px 8px", fontWeight: 600 }}>{p.nombre}</td>
                        <td style={{ padding: "12px 8px" }}>{p.categoria}</td>
                        <td style={{ padding: "12px 8px", color: "var(--bronze)", fontWeight: 700 }}>
                          ${p.precio.toLocaleString()} MXN
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <span className={`badge ${p.stock > 0 ? "badge-success" : "badge-danger"}`}>
                            {p.stock} piezas
                          </span>
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          {qrUrl && (
                            <div style={{ padding: 4, background: "#fff", display: "inline-block", border: "1px solid var(--border)" }}>
                              <QRCodeSVG value={qrUrl} size={30} />
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <Link href={`/calzado/${p.id}`} target="_blank" className="btn btn-icon btn-sm" title="Ver catálogo cliente">
                              <i className="ri-external-link-line" />
                            </Link>
                            <button className="btn btn-icon btn-sm" onClick={() => setEditingShoe(p)} title="Editar precio / stock">
                              <i className="ri-pencil-line" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, flexWrap: "wrap", gap: 12 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Mostrando del <strong>{((currentPage - 1) * itemsPerPage) + 1}</strong> al <strong>{Math.min(currentPage * itemsPerPage, filteredCatalog.length)}</strong> de <strong>{filteredCatalog.length}</strong> modelos.
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setCurrentPage(1)} 
                  disabled={currentPage === 1}
                >
                  <i className="ri-double-left-line" /> Primero
                </button>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
                  disabled={currentPage === 1}
                >
                  Anterior
                </button>
                <span style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-secondary)" }}>
                  Pág. <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
                </span>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </button>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setCurrentPage(totalPages)} 
                  disabled={currentPage === totalPages}
                >
                  Último <i className="ri-double-right-line" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor Modal */}
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
                <input 
                  type="number" 
                  className="form-input" 
                  value={editingShoe.precio} 
                  onChange={e => setEditingShoe({ ...editingShoe, precio: parseFloat(e.target.value) || 0 })}
                  min={1} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Stock en Existencia</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={editingShoe.stock} 
                  onChange={e => setEditingShoe({ ...editingShoe, stock: parseInt(e.target.value) || 0 })}
                  min={0} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Características Principales</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editingShoe.caracteristicas} 
                  onChange={e => setEditingShoe({ ...editingShoe, caracteristicas: e.target.value })}
                />
              </div>
            </div>
            <div className="boutique-modal-footer">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingShoe(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm">Guardar Cambios</button>
            </div>
          </form>
        </div>
      )}

      {/* Label Print Modal */}
      {showLabelPrint && (
        <div className="boutique-modal-overlay">
          <div className="boutique-modal" style={{ maxWidth: 650 }}>
            <div className="boutique-modal-header">
              <h3 style={{ fontSize: 18, margin: 0 }}>Vista de Impresión de Etiquetas QR</h3>
              <button onClick={() => setShowLabelPrint(false)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20 }}><i className="ri-close-line" /></button>
            </div>
            <div className="boutique-modal-body" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {catalog.filter(p => selectedLabels.includes(p.id)).map(p => {
                  const qrUrl = typeof window !== "undefined" ? `${window.location.origin}/calzado/${p.id}` : "";
                  
                  return (
                    <div 
                      key={p.id} 
                      style={{ 
                        border: "1px solid #000", 
                        padding: 16, 
                        display: "flex", 
                        gap: 12, 
                        background: "#fff", 
                        alignItems: "center",
                        fontFamily: "monospace" 
                      }}
                    >
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: "bold", textTransform: "uppercase" }}>ShoesQR Boutique</div>
                        <div style={{ fontSize: 12, fontWeight: "bold" }}>{p.nombre}</div>
                        <div style={{ fontSize: 10 }}>SKU: {p.sku}</div>
                        <div style={{ fontSize: 10 }}>Categoría: {p.categoria}</div>
                        <div style={{ fontSize: 11, fontWeight: "bold", color: "var(--bronze)", marginTop: 4 }}>
                          ${p.precio.toLocaleString()} MXN
                        </div>
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
              <button className="btn btn-secondary btn-sm" onClick={() => setShowLabelPrint(false)}>Cerrar</button>
              <button className="btn btn-primary btn-sm" onClick={() => window.print()}><i className="ri-printer-line" /> Imprimir Etiquetas</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
