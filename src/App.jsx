import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { supabase } from "./supabaseClient";
import "./App.css";

const IVA_RATE = 0.19;
const clp = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");
const today = () => new Date().toISOString().slice(0, 10);

const CATEGORIAS_EGR = [
  "Mano de Obra Directa", "Materiales", "Subcontratos", "Arriendo de Equipos",
  "Combustible / Transporte", "EPP / Seguridad", "Alimentación / Viáticos",
  "Fletes", "Permisos / Certificaciones", "Mantención / Reparaciones",
  "Administración proyecto", "Arriendo oficina", "Contador", "Sueldos administrativos",
  "Gastos bancarios", "Otros Costos Variables",
];
const CATEGORIAS_ING = [
  "Facturación Proyectos", "Anticipos de Clientes", "Estados de Pago (EEPP)",
  "Servicios Menores / Extras", "Venta de Activos", "Préstamos / Capital",
  "Otros Ingresos",
];
const UNIDADES = ["un", "m", "m²", "m³", "kg", "sacos"];
const ESTADOS_FACT = ["Emitida", "Por cobrar", "Pagada"];
const ESTADO_COLOR = {
  Emitida: { bg: "var(--bg-warning)", fg: "var(--text-warning)" },
  "Por cobrar": { bg: "var(--bg-accent)", fg: "var(--text-accent)" },
  Pagada: { bg: "var(--bg-success)", fg: "var(--text-success)" },
};

// ============================================================
// LOGIN
// ============================================================
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    setError("");
    if (!email || !pass) { setError("Ingresa correo y contraseña."); return; }
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setCargando(false);
    if (error) { setError("Correo o contraseña incorrectos."); return; }
    onLogin();
  };

  return (
    <div style={S.loginPage}>
      <div style={S.loginCard}>
        <div style={S.loginLogo}>EC</div>
        <h1 style={S.loginTitle}>Estero Construcciones</h1>
        <p style={S.loginSub}>Control de proyectos, flujo y facturación</p>
        <div style={{ marginTop: 20 }}>
          <div style={S.fieldLabel}>Correo</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            placeholder="tucorreo@ejemplo.cl" style={S.input} type="email" />
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={S.fieldLabel}>Contraseña</div>
          <input value={pass} onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            placeholder="••••••••" style={S.input} type="password" />
        </div>
        {error && <div style={S.loginError}>{error}</div>}
        <button onClick={entrar} disabled={cargando}
          style={{ ...S.primaryBtn, width: "100%", marginTop: 18, height: 42, opacity: cargando ? 0.6 : 1 }}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// APP PRINCIPAL
// ============================================================
function App() {
  const [sesion, setSesion] = useState(null);
  const [checando, setChecando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setChecando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checando) return <div style={S.loadingFull}>Cargando…</div>;
  if (!sesion) return <Login onLogin={() => {}} />;
  return <Panel onLogout={() => supabase.auth.signOut()} email={sesion.user.email} />;
}

// ============================================================
// PANEL (una vez con sesión)
// ============================================================
function Panel({ onLogout, email }) {
  const [tab, setTab] = useState("resumen");
  const [proyectos, setProyectos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [trabajadores, setTrabajadores] = useState([]);
  const [dias, setDias] = useState([]);
  const [anticipos, setAnticipos] = useState([]);
  const [filtroProy, setFiltroProy] = useState("TODOS");
  const [cargando, setCargando] = useState(true);

  const cargarTodo = async () => {
    setCargando(true);
    const [p, m, f, mat, tr, di, an] = await Promise.all([
      supabase.from("proyectos").select("*").order("id"),
      supabase.from("movimientos").select("*").order("fecha", { ascending: false }),
      supabase.from("facturas").select("*").order("fecha", { ascending: false }),
      supabase.from("materiales").select("*").order("id"),
      supabase.from("trabajadores").select("*").order("nombre"),
      supabase.from("dias_trabajados").select("*"),
      supabase.from("anticipos").select("*").order("fecha", { ascending: false }),
    ]);
    setProyectos(p.data || []);
    setMovs(m.data || []);
    setFacturas(f.data || []);
    setMateriales(mat.data || []);
    setTrabajadores(tr.data || []);
    setDias(di.data || []);
    setAnticipos(an.data || []);
    setCargando(false);
  };

  useEffect(() => { cargarTodo(); }, []);

  const nombreProy = (pid) => {
    const p = proyectos.find((x) => x.id === pid);
    return p ? `${p.id} · ${p.cliente}` : pid;
  };

  // ---- CRUD proyectos ----
  const addProyecto = async (proy) => {
    const { data, error } = await supabase.from("proyectos").insert(proy).select();
    if (!error && data) setProyectos((p) => [...p, ...data]);
    return error;
  };

  // ---- CRUD movimientos ----
  const addMov = async (mov) => {
    const { data, error } = await supabase.from("movimientos").insert(mov).select();
    if (!error && data) setMovs((p) => [...data, ...p]);
  };
  const toggleMovPagado = async (id, actual) => {
    const { error } = await supabase.from("movimientos").update({ pagado: !actual }).eq("id", id);
    if (!error) setMovs((p) => p.map((x) => x.id === id ? { ...x, pagado: !actual } : x));
  };
  const delMov = async (id) => {
    const { error } = await supabase.from("movimientos").delete().eq("id", id);
    if (!error) setMovs((p) => p.filter((x) => x.id !== id));
  };

  // ---- CRUD facturas ----
  const addFactura = async (fac) => {
    const { data, error } = await supabase.from("facturas").insert(fac).select();
    if (!error && data) setFacturas((p) => [...data, ...p]);
  };
  const setEstadoFactura = async (id, estado) => {
    const { error } = await supabase.from("facturas").update({ estado }).eq("id", id);
    if (!error) setFacturas((p) => p.map((x) => x.id === id ? { ...x, estado } : x));
  };
  const delFactura = async (id) => {
    const { error } = await supabase.from("facturas").delete().eq("id", id);
    if (!error) setFacturas((p) => p.filter((x) => x.id !== id));
  };

  // ---- CRUD materiales ----
  const addMaterial = async (mat) => {
    const { data, error } = await supabase.from("materiales").insert(mat).select();
    if (!error && data) setMateriales((p) => [...p, ...data]);
  };
  const setComprado = async (id, comprado) => {
    const { error } = await supabase.from("materiales").update({ comprado }).eq("id", id);
    if (!error) setMateriales((p) => p.map((x) => x.id === id ? { ...x, comprado } : x));
  };
  const delMaterial = async (id) => {
    const { error } = await supabase.from("materiales").delete().eq("id", id);
    if (!error) setMateriales((p) => p.filter((x) => x.id !== id));
  };

  // ---- CRUD trabajadores ----
  const addTrabajador = async (t) => {
    const { data, error } = await supabase.from("trabajadores").insert(t).select();
    if (!error && data) setTrabajadores((p) => [...p, ...data]);
    return error;
  };
  const delTrabajador = async (id) => {
    const { error } = await supabase.from("trabajadores").delete().eq("id", id);
    if (!error) {
      setTrabajadores((p) => p.filter((x) => x.id !== id));
      setDias((p) => p.filter((x) => x.trabajador !== id));
      setAnticipos((p) => p.filter((x) => x.trabajador !== id));
    }
  };
  // ---- Días trabajados: alternar un día ----
  const toggleDia = async (trabajadorId, fecha) => {
    const existe = dias.find((d) => d.trabajador === trabajadorId && d.fecha === fecha);
    if (existe) {
      const { error } = await supabase.from("dias_trabajados").delete().eq("id", existe.id);
      if (!error) setDias((p) => p.filter((x) => x.id !== existe.id));
    } else {
      const { data, error } = await supabase.from("dias_trabajados")
        .insert({ trabajador: trabajadorId, fecha }).select();
      if (!error && data) setDias((p) => [...p, ...data]);
    }
  };
  // ---- CRUD anticipos ----
  const addAnticipo = async (a) => {
    const { data, error } = await supabase.from("anticipos").insert(a).select();
    if (!error && data) setAnticipos((p) => [...data, ...p]);
  };
  const toggleAnticipo = async (id, descontado) => {
    const { error } = await supabase.from("anticipos").update({ descontado: !descontado }).eq("id", id);
    if (!error) setAnticipos((p) => p.map((x) => x.id === id ? { ...x, descontado: !descontado } : x));
  };
  const delAnticipo = async (id) => {
    const { error } = await supabase.from("anticipos").delete().eq("id", id);
    if (!error) setAnticipos((p) => p.filter((x) => x.id !== id));
  };

  // ---- Cálculos ----
  // Caja/flujo se mueve por el TOTAL (con IVA); resultado/utilidad por el NETO (sin IVA).
  const montoCaja = (x) => (x.total != null ? x.total : x.neto);

  const resumenProyectos = useMemo(() => {
    return proyectos.map((p) => {
      const m = movs.filter((x) => x.proyecto === p.id);
      const ing = m.filter((x) => x.tipo === "ING").reduce((s, x) => s + x.neto, 0);
      const egr = m.filter((x) => x.tipo === "EGR").reduce((s, x) => s + x.neto, 0);
      const cajaIn = m.filter((x) => x.tipo === "ING" && x.pagado).reduce((s, x) => s + montoCaja(x), 0);
      const cajaOut = m.filter((x) => x.tipo === "EGR" && x.pagado).reduce((s, x) => s + montoCaja(x), 0);
      return { ...p, ingresos: ing, egresos: egr, resultado: ing - egr,
        caja: cajaIn - cajaOut, porFacturar: (p.presupuesto || 0) - ing };
    });
  }, [proyectos, movs]);

  const totales = useMemo(() => {
    const ing = movs.filter((x) => x.tipo === "ING").reduce((s, x) => s + x.neto, 0);
    const egr = movs.filter((x) => x.tipo === "EGR").reduce((s, x) => s + x.neto, 0);
    const cajaIn = movs.filter((x) => x.tipo === "ING" && x.pagado).reduce((s, x) => s + montoCaja(x), 0);
    const cajaOut = movs.filter((x) => x.tipo === "EGR" && x.pagado).reduce((s, x) => s + montoCaja(x), 0);
    const porCobrar = facturas.filter((f) => f.estado !== "Pagada")
      .reduce((s, f) => s + f.neto * (f.exento ? 1 : 1 + IVA_RATE), 0);
    return { ing, egr, resultado: ing - egr, caja: cajaIn - cajaOut, porCobrar };
  }, [movs, facturas]);

  const movsFiltrados = useMemo(() => {
    const l = filtroProy === "TODOS" ? movs : movs.filter((x) => x.proyecto === filtroProy);
    return [...l].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [movs, filtroProy]);

  const sinProyectos = proyectos.length === 0;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.brandRow}>
          <div style={S.logo}>EC</div>
          <div style={{ flex: 1 }}>
            <h1 style={S.h1}>Estero Construcciones</h1>
            <p style={S.sub}>Control de proyectos, flujo y facturación</p>
          </div>
          <button onClick={onLogout} style={S.logoutBtn}>Salir</button>
        </div>
      </header>

      <nav style={S.nav}>
        {[
          ["resumen", "Resumen"],
          ["movimientos", "Movimientos"],
          ["caja", "Caja empresa"],
          ["iva", "IVA (F29)"],
          ["facturacion", "Facturación"],
          ["materiales", "Materiales"],
          ["personal", "Personal"],
          ["proyectos", "Proyectos"],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ ...S.navBtn, ...(tab === k ? S.navBtnActive : {}) }}>
            {label}
          </button>
        ))}
      </nav>

      <main style={S.main}>
        {cargando ? (
          <div style={S.loading}>Cargando datos…</div>
        ) : sinProyectos && tab !== "proyectos" ? (
          <div style={S.card}>
            <h2 style={S.h2}>Bienvenido</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              Aún no tienes proyectos. Crea el primero en la pestaña <b>Proyectos</b> para empezar a cargar
              movimientos, facturas y materiales.
            </p>
            <button onClick={() => setTab("proyectos")} style={{ ...S.primaryBtn, marginTop: 8 }}>
              Ir a Proyectos
            </button>
          </div>
        ) : (
          <>
            {tab === "resumen" && <Resumen totales={totales} resumen={resumenProyectos} setTab={setTab} />}
            {tab === "movimientos" && (
              <Movimientos movs={movsFiltrados} proyectos={proyectos}
                filtroProy={filtroProy} setFiltroProy={setFiltroProy}
                onAdd={addMov} onTogglePagado={toggleMovPagado} onDelete={delMov} />
            )}
            {tab === "caja" && <CajaEmpresa movs={movs} clp={clp} />}
            {tab === "iva" && <IvaMensual movs={movs} facturas={facturas} clp={clp} />}
            {tab === "facturacion" && (
              <Facturacion facturas={facturas} proyectos={proyectos}
                onAdd={addFactura} onEstado={setEstadoFactura} onDelete={delFactura} />
            )}
            {tab === "materiales" && (
              <Materiales materiales={materiales} proyectos={proyectos}
                filtroProy={filtroProy} setFiltroProy={setFiltroProy}
                onAdd={addMaterial} onComprar={setComprado} onDelete={delMaterial} />
            )}
            {tab === "personal" && (
              <Personal trabajadores={trabajadores} proyectos={proyectos}
                dias={dias} anticipos={anticipos} clp={clp}
                onAddTrabajador={addTrabajador} onDelTrabajador={delTrabajador}
                onToggleDia={toggleDia} onAddAnticipo={addAnticipo}
                onToggleAnticipo={toggleAnticipo} onDelAnticipo={delAnticipo} />
            )}
            {tab === "proyectos" && (
              <Proyectos resumen={resumenProyectos} onAdd={addProyecto} />
            )}
          </>
        )}
      </main>

      <footer style={S.footer}>
        Sesión: {email} · Estero Construcciones SpA
      </footer>
    </div>
  );
}

// ---------- RESUMEN ----------
function Resumen({ totales, resumen, setTab }) {
  return (
    <div>
      <div style={S.metricGrid}>
        <Metric label="Ingresos netos (total)" value={clp(totales.ing)} />
        <Metric label="Egresos netos (total)" value={clp(totales.egr)} />
        <Metric label="Resultado neto" value={clp(totales.resultado)} tone={totales.resultado >= 0 ? "pos" : "neg"} />
        <Metric label="Caja neta (pagado)" value={clp(totales.caja)} tone={totales.caja >= 0 ? "pos" : "neg"} />
        <Metric label="Por cobrar (facturas)" value={clp(totales.porCobrar)} tone="accent" />
      </div>
      <div style={S.card}>
        <div style={S.cardHead}>
          <h2 style={S.h2}>Resultado por proyecto</h2>
          <button style={S.linkBtn} onClick={() => setTab("proyectos")}>Ver detalle</button>
        </div>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Proyecto</th><th style={S.thR}>Ingresos</th>
            <th style={S.thR}>Egresos</th><th style={S.thR}>Resultado</th>
          </tr></thead>
          <tbody>
            {resumen.length === 0 && <tr><td colSpan={4} style={S.empty}>Sin proyectos aún.</td></tr>}
            {resumen.map((p) => (
              <tr key={p.id}>
                <td style={S.td}><b>{p.id}</b> · {p.cliente}</td>
                <td style={S.tdR}>{clp(p.ingresos)}</td>
                <td style={S.tdR}>{clp(p.egresos)}</td>
                <td style={{ ...S.tdR, color: p.resultado >= 0 ? "var(--text-success)" : "var(--text-danger)", fontWeight: 500 }}>
                  {clp(p.resultado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- MOVIMIENTOS ----------
function Movimientos({ movs, proyectos, filtroProy, setFiltroProy, onAdd, onTogglePagado, onDelete }) {
  const [f, setF] = useState({
    fecha: today(), proyecto: "", tipo: "EGR", categoria: CATEGORIAS_EGR[0],
    detalle: "", monto: "", doc: "FACTURA", incluyeIva: true, pagado: true,
  });
  const cats = f.tipo === "ING" ? CATEGORIAS_ING : CATEGORIAS_EGR;

  const set = (k, v) => setF((p) => {
    const next = { ...p, [k]: v };
    if (k === "tipo") next.categoria = (v === "ING" ? CATEGORIAS_ING : CATEGORIAS_EGR)[0];
    return next;
  });

  const submit = () => {
    const bruto = parseFloat(f.monto);
    if (!bruto || bruto <= 0) return;
    // El monto que ingresa el usuario es el que se mueve en el banco (total).
    // Si incluye IVA, el neto se obtiene dividiendo; si no, neto = total.
    const total = Math.round(bruto);
    const neto = f.incluyeIva ? Math.round(bruto / (1 + IVA_RATE)) : Math.round(bruto);
    onAdd({
      fecha: f.fecha, proyecto: f.proyecto || null, tipo: f.tipo, categoria: f.categoria,
      detalle: f.detalle, neto, total, doc: f.doc, pagado: f.pagado,
    });
    setF({ ...f, detalle: "", monto: "" });
  };

  const previewTotal = f.monto ? Math.round(parseFloat(f.monto)) : 0;
  const previewNeto = f.monto
    ? (f.incluyeIva ? Math.round(parseFloat(f.monto) / (1 + IVA_RATE)) : Math.round(parseFloat(f.monto))) : 0;

  return (
    <div>
      <div style={S.card}>
        <h2 style={S.h2}>Cargar movimiento</h2>
        <div style={S.formGrid}>
          <Field label="Fecha">
            <input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} style={S.input} />
          </Field>
          <Field label="Proyecto">
            <select value={f.proyecto} onChange={(e) => set("proyecto", e.target.value)} style={S.input}>
              <option value="">— Gasto general (sin proyecto) —</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.cliente}</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)} style={S.input}>
              <option value="EGR">Egreso</option><option value="ING">Ingreso</option>
            </select>
          </Field>
          <Field label="Categoría">
            <select value={f.categoria} onChange={(e) => set("categoria", e.target.value)} style={S.input}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Detalle">
            <input value={f.detalle} onChange={(e) => set("detalle", e.target.value)}
              placeholder="diesel, arriendo…" style={S.input} />
          </Field>
          <Field label="Documento">
            <select value={f.doc} onChange={(e) => set("doc", e.target.value)} style={S.input}>
              <option>FACTURA</option><option>BOLETA</option>
            </select>
          </Field>
          <Field label={f.incluyeIva ? "Monto (con IVA)" : "Monto (neto)"}>
            <input type="number" value={f.monto} onChange={(e) => set("monto", e.target.value)}
              placeholder="0" style={S.input} />
          </Field>
          <Field label="IVA">
            <label style={S.check}>
              <input type="checkbox" checked={f.incluyeIva} onChange={(e) => set("incluyeIva", e.target.checked)} />
              Incluye IVA 19%
            </label>
          </Field>
          <Field label="Estado">
            <label style={S.check}>
              <input type="checkbox" checked={f.pagado} onChange={(e) => set("pagado", e.target.checked)} />
              Ya pagado
            </label>
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
            <div>
              <div style={S.fieldLabel}>Total (a caja)</div>
              <div style={S.previewVal}>{clp(previewTotal)}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>Neto (a resultado)</div>
              <div style={S.previewSmall}>{clp(previewNeto)}</div>
            </div>
            <button onClick={submit} style={{ ...S.primaryBtn, marginLeft: "auto" }}>Agregar</button>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHead}>
          <h2 style={S.h2}>Movimientos</h2>
          <select value={filtroProy} onChange={(e) => setFiltroProy(e.target.value)} style={{ ...S.input, width: "auto" }}>
            <option value="TODOS">Todos los proyectos</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.cliente}</option>)}
          </select>
        </div>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Fecha</th><th style={S.th}>Proyecto</th><th style={S.th}>Categoría</th>
            <th style={S.th}>Detalle</th><th style={S.thR}>Neto</th><th style={S.thR}>Total (caja)</th><th style={S.thC}>Pagado</th><th style={S.thC}></th>
          </tr></thead>
          <tbody>
            {movs.length === 0 && <tr><td colSpan={8} style={S.empty}>Aún no hay movimientos. Carga el primero arriba.</td></tr>}
            {movs.map((m) => (
              <tr key={m.id}>
                <td style={S.td}>{m.fecha}</td>
                <td style={S.td}>{m.proyecto || <span style={{ color: "var(--text-muted)" }}>General</span>}</td>
                <td style={S.td}>
                  <span style={{ ...S.pill, background: m.tipo === "ING" ? "var(--bg-success)" : "var(--bg-danger)",
                    color: m.tipo === "ING" ? "var(--text-success)" : "var(--text-danger)" }}>{m.tipo}</span>{" "}{m.categoria}
                </td>
                <td style={{ ...S.td, color: "var(--text-secondary)" }}>{m.detalle || "—"}</td>
                <td style={{ ...S.tdR, color: "var(--text-muted)" }}>{clp(m.neto)}</td>
                <td style={{ ...S.tdR, fontWeight: 500 }}>{clp(m.total != null ? m.total : m.neto)}</td>
                <td style={S.tdC}>
                  <button onClick={() => onTogglePagado(m.id, m.pagado)} style={{ ...S.tinyBtn,
                    background: m.pagado ? "var(--bg-success)" : "var(--surface-1)",
                    color: m.pagado ? "var(--text-success)" : "var(--text-muted)" }}>
                    {m.pagado ? "Sí" : "No"}
                  </button>
                </td>
                <td style={S.tdC}><button onClick={() => onDelete(m.id)} style={S.delBtn}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- IVA MENSUAL (F29) ----------
function IvaMensual({ movs, facturas, clp }) {
  const nombreMes = (ym) => {
    const [y, m] = ym.split("-");
    const n = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${n[parseInt(m, 10) - 1]} ${y}`;
  };

  // Débito: IVA de facturas emitidas no exentas, por mes de emisión.
  // Crédito: IVA de egresos con documento FACTURA que llevaban IVA (total > neto), por mes.
  //   Se toma el mes por fecha; para gastos, solo los pagados (criterio elegido: por fecha de pago).
  const meses = {};
  const add = (mes, campo, val) => {
    if (!mes) return;
    if (!meses[mes]) meses[mes] = { debito: 0, credito: 0 };
    meses[mes][campo] += val;
  };

  facturas.forEach((f) => {
    if (f.exento) return;
    const iva = Math.round(f.neto * IVA_RATE);
    add((f.fecha || "").slice(0, 7), "debito", iva);
  });

  movs.forEach((m) => {
    if (m.tipo !== "EGR") return;
    if (m.doc !== "FACTURA") return;      // solo factura da crédito
    if (!m.pagado) return;                // por fecha de pago
    const total = m.total != null ? m.total : m.neto;
    const iva = total - m.neto;           // 0 si fue sin IVA
    if (iva <= 0) return;
    add((m.fecha || "").slice(0, 7), "credito", iva);
  });

  const filas = Object.keys(meses).sort().reverse().map((mes) => {
    const { debito, credito } = meses[mes];
    const aPagar = debito - credito;
    return { mes, debito, credito, aPagar };
  });

  return (
    <div>
      <div style={S.card}>
        <h2 style={S.h2}>IVA mensual — estimación para el F29</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>
          <b>Débito</b> = IVA de tus facturas emitidas (lo que cobraste). <b>Crédito</b> = IVA de tus
          gastos con factura (lo que pagaste). <b>A pagar</b> = débito − crédito.
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Estimación para planificar cuánto provisionar. El monto oficial lo cuadra tu contador con el SII.
        </p>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Mes</th>
            <th style={S.thR}>IVA débito (ventas)</th>
            <th style={S.thR}>IVA crédito (compras)</th>
            <th style={S.thR}>Resultado</th>
          </tr></thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={4} style={S.empty}>Aún no hay datos para calcular IVA.</td></tr>}
            {filas.map((r) => {
              const aFavor = r.aPagar < 0;
              return (
                <tr key={r.mes}>
                  <td style={S.td}><b>{nombreMes(r.mes)}</b></td>
                  <td style={{ ...S.tdR, color: "var(--text-success)" }}>{clp(r.debito)}</td>
                  <td style={{ ...S.tdR, color: "var(--text-danger)" }}>{clp(r.credito)}</td>
                  <td style={{ ...S.tdR, fontWeight: 600, color: aFavor ? "var(--text-accent)" : "var(--text-primary)" }}>
                    {aFavor ? `${clp(Math.abs(r.aPagar))} a favor` : `${clp(r.aPagar)} a pagar`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- CAJA EMPRESA ----------
function CajaEmpresa({ movs, clp }) {
  const [base, setBase] = useState("pagado");
  const incluir = (m) => base === "comprometido" ? true : m.pagado;
  const relevantes = movs.filter(incluir);

  // La caja se mueve por el monto TOTAL (con IVA): es la plata que entra/sale del banco.
  // Se usa total; si un registro antiguo no tuviera total, se cae al neto como respaldo.
  const montoCaja = (m) => (m.total != null ? m.total : m.neto);

  const ingresos = relevantes.filter((m) => m.tipo === "ING").reduce((s, m) => s + montoCaja(m), 0);
  const egresos = relevantes.filter((m) => m.tipo === "EGR").reduce((s, m) => s + montoCaja(m), 0);
  const saldo = ingresos - egresos;
  const cajaReal = movs.filter((m) => m.pagado).reduce((s, m) => s + (m.tipo === "ING" ? montoCaja(m) : -montoCaja(m)), 0);

  const meses = {};
  relevantes.forEach((m) => {
    const mes = (m.fecha || "").slice(0, 7);
    if (!mes) return;
    if (!meses[mes]) meses[mes] = { ing: 0, egr: 0 };
    if (m.tipo === "ING") meses[mes].ing += montoCaja(m); else meses[mes].egr += montoCaja(m);
  });
  const mesesOrden = Object.keys(meses).sort();
  let acumulado = 0;
  const filas = mesesOrden.map((mes) => {
    const { ing, egr } = meses[mes];
    const neto = ing - egr; acumulado += neto;
    return { mes, ing, egr, neto, acumulado };
  });

  const nombreMes = (ym) => {
    const [y, m] = ym.split("-");
    const n = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${n[parseInt(m, 10) - 1]} ${y}`;
  };
  const gastosGenerales = relevantes.filter((m) => m.tipo === "EGR" && !m.proyecto).reduce((s, m) => s + montoCaja(m), 0);
  const dataGrafico = filas.map((r) => ({ mes: nombreMes(r.mes), Ingresos: r.ing, Egresos: r.egr, Acumulado: r.acumulado }));
  const miles = (v) => "$" + Math.round(v / 1000).toLocaleString("es-CL") + "k";

  return (
    <div>
      <div style={S.metricGrid}>
        <Metric label="Saldo de caja hoy (real)" value={clp(cajaReal)} tone={cajaReal >= 0 ? "pos" : "neg"} />
        <Metric label={base === "pagado" ? "Ingresos (pagados)" : "Ingresos (comprometidos)"} value={clp(ingresos)} />
        <Metric label={base === "pagado" ? "Egresos (pagados)" : "Egresos (comprometidos)"} value={clp(egresos)} />
        <Metric label="Resultado del período" value={clp(saldo)} tone={saldo >= 0 ? "pos" : "neg"} />
      </div>

      <div style={S.card}>
        <div style={S.cardHead}>
          <h2 style={S.h2}>Flujo de caja</h2>
          <div style={S.toggleWrap}>
            <button onClick={() => setBase("pagado")} style={{ ...S.toggleBtn, ...(base === "pagado" ? S.toggleBtnOn : {}) }}>Solo pagado</button>
            <button onClick={() => setBase("comprometido")} style={{ ...S.toggleBtn, ...(base === "comprometido" ? S.toggleBtnOn : {}) }}>Todo comprometido</button>
          </div>
        </div>
        {dataGrafico.length === 0 ? (
          <div style={S.empty}>Aún no hay movimientos para graficar.</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Ingresos vs egresos por mes</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dataGrafico} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} />
                <YAxis tickFormatter={miles} tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={54} />
                <Tooltip formatter={(v) => clp(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Ingresos" fill="#1D9E75" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Egresos" fill="#E24B4A" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", margin: "18px 0 8px" }}>Saldo acumulado en el tiempo</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dataGrafico} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} />
                <YAxis tickFormatter={miles} tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={54} />
                <Tooltip formatter={(v) => clp(v)} />
                <Line type="monotone" dataKey="Acumulado" stroke="#534AB7" strokeWidth={2} dot={{ r: 3, fill: "#534AB7" }} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      <div style={S.card}>
        <h2 style={S.h2}>Flujo mes a mes</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
          {base === "pagado" ? "Muestra solo lo efectivamente pagado o cobrado: tu caja real."
            : "Incluye lo pendiente (no pagado / por cobrar): tu posición comprometida."}
        </p>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Mes</th><th style={S.thR}>Ingresos</th><th style={S.thR}>Egresos</th>
            <th style={S.thR}>Neto mes</th><th style={S.thR}>Acumulado</th>
          </tr></thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={5} style={S.empty}>Aún no hay movimientos.</td></tr>}
            {filas.map((r) => (
              <tr key={r.mes}>
                <td style={S.td}><b>{nombreMes(r.mes)}</b></td>
                <td style={{ ...S.tdR, color: "var(--text-success)" }}>{clp(r.ing)}</td>
                <td style={{ ...S.tdR, color: "var(--text-danger)" }}>{clp(r.egr)}</td>
                <td style={{ ...S.tdR, fontWeight: 500, color: r.neto >= 0 ? "var(--text-success)" : "var(--text-danger)" }}>{clp(r.neto)}</td>
                <td style={{ ...S.tdR, fontWeight: 500 }}>{clp(r.acumulado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={S.card}>
        <h2 style={S.h2}>Gastos generales de empresa (sin proyecto)</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Total {base === "pagado" ? "pagado" : "comprometido"} en gastos no asociados a un proyecto:{" "}
          <b style={{ color: "var(--text-danger)" }}>{clp(gastosGenerales)}</b>.{" "}
          Cárgalos en Movimientos eligiendo "Gasto general (sin proyecto)".
        </p>
      </div>
    </div>
  );
}

// ---------- FACTURACIÓN ----------
function Facturacion({ facturas, proyectos, onAdd, onEstado, onDelete }) {
  const mas30 = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };
  const [f, setF] = useState({ fecha: today(), vencimiento: mas30(), proyecto: "", folio: "", neto: "", exento: false, estado: "Emitida" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const total = (neto, exento) => Math.round(neto * (exento ? 1 : 1 + IVA_RATE));

  const submit = () => {
    const neto = parseFloat(f.neto);
    if (!neto || neto <= 0 || !f.proyecto) return;
    const p = proyectos.find((x) => x.id === f.proyecto);
    onAdd({ fecha: f.fecha, vencimiento: f.vencimiento || null, proyecto: f.proyecto, cliente: p?.cliente || "",
      folio: f.folio || "s/folio", neto: Math.round(neto), exento: f.exento, estado: f.estado });
    setF({ ...f, folio: "", neto: "", vencimiento: mas30() });
  };

  // Días que faltan (o pasaron) para el vencimiento. Negativo = ya venció.
  const diasPara = (venc) => {
    if (!venc) return null;
    const hoy = new Date(today());
    const v = new Date(venc);
    return Math.round((v - hoy) / (1000 * 60 * 60 * 24));
  };
  // Semáforo solo para facturas no pagadas.
  const semaforo = (x) => {
    if (x.estado === "Pagada") return null;
    const d = diasPara(x.vencimiento);
    if (d === null) return null;
    if (d < 0) return "vencida";
    if (d <= 5) return "porvencer";
    return "aldia";
  };
  const SEM = {
    vencida: { bg: "var(--bg-danger)", fg: "var(--text-danger)", txt: "Vencida" },
    porvencer: { bg: "var(--bg-warning)", fg: "var(--text-warning)", txt: "Por vencer" },
    aldia: { bg: "var(--bg-success)", fg: "var(--text-success)", txt: "Al día" },
  };

  const previewIva = f.neto && !f.exento ? Math.round(parseFloat(f.neto) * IVA_RATE) : 0;
  const previewTotal = f.neto ? total(parseFloat(f.neto), f.exento) : 0;
  const totPorCobrar = facturas.filter((x) => x.estado !== "Pagada").reduce((s, x) => s + total(x.neto, x.exento), 0);
  const totVencido = facturas.filter((x) => semaforo(x) === "vencida").reduce((s, x) => s + total(x.neto, x.exento), 0);
  const nVencidas = facturas.filter((x) => semaforo(x) === "vencida").length;

  return (
    <div>
      <div style={S.metricGrid}>
        <Metric label="Facturas emitidas" value={facturas.length} />
        <Metric label="Por cobrar" value={clp(totPorCobrar)} tone="accent" />
        <Metric label={nVencidas > 0 ? `⚠ Vencido (${nVencidas})` : "Vencido"} value={clp(totVencido)} tone={totVencido > 0 ? "neg" : "pos"} />
        <Metric label="Cobradas" value={facturas.filter((x) => x.estado === "Pagada").length + " de " + facturas.length} />
      </div>
      <div style={S.card}>
        <h2 style={S.h2}>Emitir factura</h2>
        {proyectos.length === 0 && <p style={{ color: "var(--text-warning)", fontSize: 13 }}>Crea un proyecto primero.</p>}
        <div style={S.formGrid}>
          <Field label="Fecha">
            <input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} style={S.input} />
          </Field>
          <Field label="Vence el (plazo de pago)">
            <input type="date" value={f.vencimiento} onChange={(e) => set("vencimiento", e.target.value)} style={S.input} />
          </Field>
          <Field label="Proyecto / Cliente">
            <select value={f.proyecto} onChange={(e) => set("proyecto", e.target.value)} style={S.input}>
              <option value="">Selecciona…</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.cliente}</option>)}
            </select>
          </Field>
          <Field label="Folio / N°">
            <input value={f.folio} onChange={(e) => set("folio", e.target.value)} placeholder="F-1051" style={S.input} />
          </Field>
          <Field label="Monto neto">
            <input type="number" value={f.neto} onChange={(e) => set("neto", e.target.value)} placeholder="0" style={S.input} />
          </Field>
          <Field label="IVA">
            <label style={S.check}>
              <input type="checkbox" checked={f.exento} onChange={(e) => set("exento", e.target.checked)} />
              Exento (sin IVA)
            </label>
          </Field>
          <Field label="Estado inicial">
            <select value={f.estado} onChange={(e) => set("estado", e.target.value)} style={S.input}>
              {ESTADOS_FACT.map((e) => <option key={e}>{e}</option>)}
            </select>
          </Field>
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
            <div><div style={S.fieldLabel}>IVA 19%</div><div style={S.previewSmall}>{clp(previewIva)}</div></div>
            <div><div style={S.fieldLabel}>Total factura</div><div style={S.previewVal}>{clp(previewTotal)}</div></div>
            <button onClick={submit} style={{ ...S.primaryBtn, marginLeft: "auto" }}>Emitir factura</button>
          </div>
        </div>
      </div>
      <div style={S.card}>
        <h2 style={S.h2}>Facturas</h2>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Fecha</th><th style={S.th}>Folio</th><th style={S.th}>Cliente</th>
            <th style={S.thR}>Neto</th><th style={S.thR}>IVA</th><th style={S.thR}>Total</th>
            <th style={S.thC}>Vence</th><th style={S.thC}>Estado</th><th style={S.thC}></th>
          </tr></thead>
          <tbody>
            {facturas.length === 0 && <tr><td colSpan={9} style={S.empty}>Sin facturas.</td></tr>}
            {facturas.map((x) => {
              const iva = x.exento ? 0 : Math.round(x.neto * IVA_RATE);
              const sem = semaforo(x);
              const d = diasPara(x.vencimiento);
              return (
                <tr key={x.id}>
                  <td style={S.td}>{x.fecha}</td>
                  <td style={S.td}><b>{x.folio}</b></td>
                  <td style={S.td}>{x.cliente} <span style={{ color: "var(--text-muted)" }}>· {x.proyecto}</span></td>
                  <td style={S.tdR}>{clp(x.neto)}</td>
                  <td style={{ ...S.tdR, color: "var(--text-muted)" }}>{x.exento ? "exento" : clp(iva)}</td>
                  <td style={{ ...S.tdR, fontWeight: 500 }}>{clp(x.neto + iva)}</td>
                  <td style={S.tdC}>
                    {sem ? (
                      <span style={{ ...S.pill, background: SEM[sem].bg, color: SEM[sem].fg, marginRight: 0 }}>
                        {sem === "vencida" ? `${SEM[sem].txt} (${Math.abs(d)}d)`
                          : sem === "porvencer" ? `${d}d` : SEM[sem].txt}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{x.vencimiento || "—"}</span>
                    )}
                  </td>
                  <td style={S.tdC}>
                    <select value={x.estado} onChange={(e) => onEstado(x.id, e.target.value)}
                      style={{ ...S.pillSelect, background: ESTADO_COLOR[x.estado].bg, color: ESTADO_COLOR[x.estado].fg }}>
                      {ESTADOS_FACT.map((e) => <option key={e}>{e}</option>)}
                    </select>
                  </td>
                  <td style={S.tdC}><button onClick={() => onDelete(x.id)} style={S.delBtn}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- MATERIALES ----------
function Materiales({ materiales, proyectos, filtroProy, setFiltroProy, onAdd, onComprar, onDelete }) {
  const [f, setF] = useState({ proyecto: "", material: "", unidad: "un", requerido: "", comprado: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    const req = parseFloat(f.requerido);
    if (!f.material.trim() || !req || req <= 0 || !f.proyecto) return;
    onAdd({ proyecto: f.proyecto, material: f.material.trim(), unidad: f.unidad,
      requerido: req, comprado: parseFloat(f.comprado) || 0 });
    setF({ ...f, material: "", requerido: "", comprado: "" });
  };

  const lista = filtroProy === "TODOS" ? materiales : materiales.filter((x) => x.proyecto === filtroProy);
  const completos = lista.filter((x) => x.comprado >= x.requerido).length;
  const pendientes = lista.length - completos;

  return (
    <div>
      <div style={S.metricGrid}>
        <Metric label="Materiales en lista" value={lista.length} />
        <Metric label="Completos" value={completos} tone="pos" />
        <Metric label="Por comprar" value={pendientes} tone={pendientes > 0 ? "accent" : "pos"} />
      </div>
      <div style={S.card}>
        <h2 style={S.h2}>Agregar material</h2>
        {proyectos.length === 0 && <p style={{ color: "var(--text-warning)", fontSize: 13 }}>Crea un proyecto primero.</p>}
        <div style={S.formGrid}>
          <Field label="Proyecto">
            <select value={f.proyecto} onChange={(e) => set("proyecto", e.target.value)} style={S.input}>
              <option value="">Selecciona…</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.cliente}</option>)}
            </select>
          </Field>
          <Field label="Material">
            <input value={f.material} onChange={(e) => set("material", e.target.value)} placeholder="Fierro 8mm, cemento…" style={S.input} />
          </Field>
          <Field label="Unidad">
            <select value={f.unidad} onChange={(e) => set("unidad", e.target.value)} style={S.input}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Cantidad requerida">
            <input type="number" value={f.requerido} onChange={(e) => set("requerido", e.target.value)} placeholder="0" style={S.input} />
          </Field>
          <Field label="Ya comprado (opcional)">
            <input type="number" value={f.comprado} onChange={(e) => set("comprado", e.target.value)} placeholder="0" style={S.input} />
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={submit} style={S.primaryBtn}>Agregar</button>
          </div>
        </div>
      </div>
      <div style={S.card}>
        <div style={S.cardHead}>
          <h2 style={S.h2}>Lista de materiales</h2>
          <select value={filtroProy} onChange={(e) => setFiltroProy(e.target.value)} style={{ ...S.input, width: "auto" }}>
            <option value="TODOS">Todos los proyectos</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.cliente}</option>)}
          </select>
        </div>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Proyecto</th><th style={S.th}>Material</th><th style={S.thR}>Requerido</th>
            <th style={S.thR}>Comprado</th><th style={S.thR}>Falta</th><th style={S.thC}>Avance</th><th style={S.thC}></th>
          </tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={7} style={S.empty}>Sin materiales. Agrega el primero arriba.</td></tr>}
            {lista.map((m) => {
              const falta = Math.max(0, m.requerido - m.comprado);
              const pct = m.requerido > 0 ? Math.min(100, Math.round((m.comprado / m.requerido) * 100)) : 0;
              const completo = falta === 0;
              return (
                <tr key={m.id}>
                  <td style={S.td}>{m.proyecto}</td>
                  <td style={S.td}><b>{m.material}</b></td>
                  <td style={S.tdR}>{m.requerido} {m.unidad}</td>
                  <td style={S.tdR}>
                    <input type="number" defaultValue={m.comprado}
                      onBlur={(e) => onComprar(m.id, parseFloat(e.target.value) || 0)} style={S.miniInput} /> {m.unidad}
                  </td>
                  <td style={{ ...S.tdR, color: completo ? "var(--text-success)" : "var(--text-warning)", fontWeight: 500 }}>
                    {completo ? "—" : `${falta} ${m.unidad}`}
                  </td>
                  <td style={S.tdC}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                      <div style={{ ...S.barTrack, width: 60 }}>
                        <div style={{ ...S.barFill, width: pct + "%", background: completo ? "#1D9E75" : "#EF9F27" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 30 }}>{pct}%</span>
                    </div>
                  </td>
                  <td style={S.tdC}><button onClick={() => onDelete(m.id)} style={S.delBtn}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- PROYECTOS ----------
function Proyectos({ resumen, onAdd }) {
  const [f, setF] = useState({ id: "", cliente: "", nombre: "", presupuesto: "" });
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setError("");
    if (!f.id.trim() || !f.cliente.trim()) { setError("Código y cliente son obligatorios."); return; }
    const err = await onAdd({
      id: f.id.trim(), cliente: f.cliente.trim(), nombre: f.nombre.trim() || f.cliente.trim(),
      presupuesto: parseInt(f.presupuesto, 10) || 0, estado: "Activo",
    });
    if (err) { setError(err.code === "23505" ? "Ya existe un proyecto con ese código." : "No se pudo guardar."); return; }
    setF({ id: "", cliente: "", nombre: "", presupuesto: "" });
  };

  return (
    <div>
      <div style={S.card}>
        <h2 style={S.h2}>Crear proyecto</h2>
        <div style={S.formGrid}>
          <Field label="Código (ej. P-001)">
            <input value={f.id} onChange={(e) => set("id", e.target.value)} placeholder="P-001" style={S.input} />
          </Field>
          <Field label="Cliente">
            <input value={f.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Minera Las Cenizas" style={S.input} />
          </Field>
          <Field label="Nombre (opcional)">
            <input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Plaza POX" style={S.input} />
          </Field>
          <Field label="Presupuesto neto">
            <input type="number" value={f.presupuesto} onChange={(e) => set("presupuesto", e.target.value)} placeholder="0" style={S.input} />
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={submit} style={S.primaryBtn}>Crear proyecto</button>
          </div>
        </div>
        {error && <div style={S.loginError}>{error}</div>}
      </div>

      <div style={S.projGrid}>
        {resumen.length === 0 && (
          <div style={{ ...S.card, gridColumn: "1 / -1" }}>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>Aún no hay proyectos. Crea el primero arriba.</p>
          </div>
        )}
        {resumen.map((p) => {
          const avance = p.presupuesto > 0 ? Math.min(100, Math.round((p.ingresos / p.presupuesto) * 100)) : 0;
          return (
            <div key={p.id} style={S.projCard}>
              <div style={S.projHead}>
                <div><div style={S.projId}>{p.id}</div><div style={S.projCli}>{p.cliente}</div></div>
                <span style={{ ...S.pill, background: "var(--bg-success)", color: "var(--text-success)" }}>{p.estado}</span>
              </div>
              <div style={S.projRow}><span>Presupuesto</span><b>{clp(p.presupuesto)}</b></div>
              <div style={S.projRow}><span>Facturado</span><b>{clp(p.ingresos)}</b></div>
              <div style={S.projRow}><span>Egresos</span><b>{clp(p.egresos)}</b></div>
              <div style={{ ...S.projRow, borderTop: "0.5px solid var(--border)", paddingTop: 8, marginTop: 4 }}>
                <span>Resultado</span>
                <b style={{ color: p.resultado >= 0 ? "var(--text-success)" : "var(--text-danger)" }}>{clp(p.resultado)}</b>
              </div>
              <div style={S.projRow}><span>Por facturar</span><b>{clp(p.porFacturar)}</b></div>
              {p.presupuesto > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={S.barTrack}><div style={{ ...S.barFill, width: avance + "%" }} /></div>
                  <div style={S.barLabel}>{avance}% facturado del presupuesto</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- PERSONAL ----------
function Personal({ trabajadores, proyectos, dias, anticipos, clp,
  onAddTrabajador, onDelTrabajador, onToggleDia, onAddAnticipo, onToggleAnticipo, onDelAnticipo }) {
  const [nuevo, setNuevo] = useState({ nombre: "", valor_dia: "", proyecto: "" });
  const [errT, setErrT] = useState("");
  const [sel, setSel] = useState(null); // id del trabajador seleccionado para el calendario
  const [mes, setMes] = useState(today().slice(0, 7)); // YYYY-MM
  const [antNuevo, setAntNuevo] = useState({ fecha: today(), monto: "" });

  const DIAS_ESPERADOS = 16;

  const crearTrabajador = async () => {
    setErrT("");
    if (!nuevo.nombre.trim() || !parseInt(nuevo.valor_dia, 10)) { setErrT("Nombre y valor por día son obligatorios."); return; }
    const err = await onAddTrabajador({
      nombre: nuevo.nombre.trim(), valor_dia: parseInt(nuevo.valor_dia, 10),
      proyecto: nuevo.proyecto || null, activo: true,
    });
    if (err) { setErrT("No se pudo guardar."); return; }
    setNuevo({ nombre: "", valor_dia: "", proyecto: "" });
  };

  // Días del mes seleccionado
  const [anio, mesNum] = mes.split("-").map(Number);
  const diasDelMes = new Date(anio, mesNum, 0).getDate();
  const listaDias = Array.from({ length: diasDelMes }, (_, i) => {
    const d = String(i + 1).padStart(2, "0");
    return `${mes}-${d}`;
  });
  const nombreDiaSemana = (fechaStr) => {
    const d = new Date(fechaStr + "T12:00:00");
    return ["D", "L", "M", "M", "J", "V", "S"][d.getDay()];
  };

  const trabajadorSel = trabajadores.find((t) => t.id === sel);
  const diasMarcadosSel = dias.filter((d) => d.trabajador === sel && d.fecha.startsWith(mes));
  const nTrabajados = diasMarcadosSel.length;

  // Anticipos del trabajador seleccionado
  const antSel = anticipos.filter((a) => a.trabajador === sel);
  const antPendientes = antSel.filter((a) => !a.descontado).reduce((s, a) => s + a.monto, 0);

  const pagoBruto = trabajadorSel ? nTrabajados * trabajadorSel.valor_dia : 0;
  const liquido = pagoBruto - antPendientes;

  const crearAnticipo = async () => {
    const monto = parseInt(antNuevo.monto, 10);
    if (!monto || monto <= 0 || !sel) return;
    await onAddAnticipo({ trabajador: sel, fecha: antNuevo.fecha, monto, descontado: false });
    setAntNuevo({ fecha: today(), monto: "" });
  };

  const nombreMesTxt = (ym) => {
    const [y, m] = ym.split("-");
    const n = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return `${n[parseInt(m, 10) - 1]} ${y}`;
  };
  const nombreProy = (pid) => {
    const p = proyectos.find((x) => x.id === pid);
    return p ? p.cliente : "—";
  };

  return (
    <div>
      {/* Alta de trabajador */}
      <div style={S.card}>
        <h2 style={S.h2}>Agregar trabajador</h2>
        <div style={S.formGrid}>
          <Field label="Nombre">
            <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              placeholder="Juan Pérez" style={S.input} />
          </Field>
          <Field label="Valor por día ($)">
            <input type="number" value={nuevo.valor_dia} onChange={(e) => setNuevo({ ...nuevo, valor_dia: e.target.value })}
              placeholder="45000" style={S.input} />
          </Field>
          <Field label="Proyecto (opcional)">
            <select value={nuevo.proyecto} onChange={(e) => setNuevo({ ...nuevo, proyecto: e.target.value })} style={S.input}>
              <option value="">Sin asignar</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.cliente}</option>)}
            </select>
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={crearTrabajador} style={S.primaryBtn}>Agregar</button>
          </div>
        </div>
        {errT && <div style={S.loginError}>{errT}</div>}
      </div>

      {/* Lista de trabajadores */}
      <div style={S.card}>
        <h2 style={S.h2}>Trabajadores</h2>
        {trabajadores.length === 0 ? (
          <div style={S.empty}>Sin trabajadores. Agrega el primero arriba.</div>
        ) : (
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Nombre</th><th style={S.th}>Proyecto</th>
              <th style={S.thR}>Valor día</th><th style={S.thC}></th><th style={S.thC}></th>
            </tr></thead>
            <tbody>
              {trabajadores.map((t) => (
                <tr key={t.id} style={sel === t.id ? { background: "var(--bg-success)" } : {}}>
                  <td style={S.td}><b>{t.nombre}</b></td>
                  <td style={{ ...S.td, color: "var(--text-secondary)" }}>{nombreProy(t.proyecto)}</td>
                  <td style={S.tdR}>{clp(t.valor_dia)}</td>
                  <td style={S.tdC}>
                    <button onClick={() => setSel(t.id)} style={{ ...S.tinyBtn,
                      background: sel === t.id ? "#1D9E75" : "var(--surface-1)",
                      color: sel === t.id ? "#fff" : "var(--text-secondary)" }}>
                      {sel === t.id ? "Viendo" : "Ver mes"}
                    </button>
                  </td>
                  <td style={S.tdC}>
                    <button onClick={() => { if (confirm(`¿Eliminar a ${t.nombre}? Se borran sus días y anticipos.`)) { onDelTrabajador(t.id); if (sel === t.id) setSel(null); } }}
                      style={S.delBtn}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Calendario y pago del trabajador seleccionado */}
      {trabajadorSel && (
        <>
          <div style={S.card}>
            <div style={S.cardHead}>
              <h2 style={S.h2}>Días trabajados — {trabajadorSel.nombre}</h2>
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ ...S.input, width: "auto" }} />
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
              Toca cada día trabajado en {nombreMesTxt(mes)}. Llevas <b>{nTrabajados}</b> de {DIAS_ESPERADOS} días esperados.
              {nTrabajados < DIAS_ESPERADOS && <span style={{ color: "var(--text-warning)" }}> Faltan {DIAS_ESPERADOS - nTrabajados} por recuperar.</span>}
              {nTrabajados > DIAS_ESPERADOS && <span style={{ color: "var(--text-accent)" }}> {nTrabajados - DIAS_ESPERADOS} días extra.</span>}
            </p>
            <div style={S.calGrid}>
              {listaDias.map((fecha) => {
                const marcado = diasMarcadosSel.some((d) => d.fecha === fecha);
                const num = parseInt(fecha.slice(-2), 10);
                return (
                  <button key={fecha} onClick={() => onToggleDia(sel, fecha)}
                    style={{ ...S.calDay, ...(marcado ? S.calDayOn : {}) }}>
                    <span style={{ fontSize: 9, opacity: 0.6 }}>{nombreDiaSemana(fecha)}</span>
                    <span>{num}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Anticipos */}
          <div style={S.card}>
            <h2 style={S.h2}>Anticipos — {trabajadorSel.nombre}</h2>
            <div style={{ ...S.formGrid, marginBottom: 14 }}>
              <Field label="Fecha">
                <input type="date" value={antNuevo.fecha} onChange={(e) => setAntNuevo({ ...antNuevo, fecha: e.target.value })} style={S.input} />
              </Field>
              <Field label="Monto del adelanto">
                <input type="number" value={antNuevo.monto} onChange={(e) => setAntNuevo({ ...antNuevo, monto: e.target.value })} placeholder="0" style={S.input} />
              </Field>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button onClick={crearAnticipo} style={S.primaryBtn}>Registrar anticipo</button>
              </div>
            </div>
            {antSel.length === 0 ? (
              <div style={S.empty}>Sin anticipos registrados.</div>
            ) : (
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Fecha</th><th style={S.thR}>Monto</th><th style={S.thC}>Estado</th><th style={S.thC}></th>
                </tr></thead>
                <tbody>
                  {antSel.map((a) => (
                    <tr key={a.id}>
                      <td style={S.td}>{a.fecha}</td>
                      <td style={S.tdR}>{clp(a.monto)}</td>
                      <td style={S.tdC}>
                        <button onClick={() => onToggleAnticipo(a.id, a.descontado)} style={{ ...S.tinyBtn,
                          background: a.descontado ? "var(--bg-success)" : "var(--bg-warning)",
                          color: a.descontado ? "var(--text-success)" : "var(--text-warning)" }}>
                          {a.descontado ? "Descontado" : "Pendiente"}
                        </button>
                      </td>
                      <td style={S.tdC}><button onClick={() => onDelAnticipo(a.id)} style={S.delBtn}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Resumen de pago */}
          <div style={S.card}>
            <h2 style={S.h2}>Pago del mes — {nombreMesTxt(mes)}</h2>
            <div style={S.pagoRow}><span>Días trabajados</span><b>{nTrabajados} × {clp(trabajadorSel.valor_dia)}</b></div>
            <div style={S.pagoRow}><span>Pago bruto</span><b>{clp(pagoBruto)}</b></div>
            <div style={S.pagoRow}><span>Anticipos pendientes por descontar</span><b style={{ color: "var(--text-danger)" }}>− {clp(antPendientes)}</b></div>
            <div style={{ ...S.pagoRow, borderTop: "0.5px solid var(--border)", paddingTop: 10, marginTop: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Líquido a pagar</span>
              <b style={{ fontSize: 20, color: "var(--text-success)" }}>{clp(liquido)}</b>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Sub-componentes ----------
function Metric({ label, value, tone }) {
  const color = tone === "pos" ? "var(--text-success)" : tone === "neg" ? "var(--text-danger)"
    : tone === "accent" ? "var(--text-accent)" : "var(--text-primary)";
  return (
    <div style={S.metric}>
      <div style={S.metricLabel}>{label}</div>
      <div style={{ ...S.metricValue, color }}>{value}</div>
    </div>
  );
}
function Field({ label, children }) {
  return <div><div style={S.fieldLabel}>{label}</div>{children}</div>;
}

// ---------- Estilos ----------
const S = {
  page: { maxWidth: 960, margin: "0 auto", minHeight: "100vh" },
  header: { padding: "20px 16px 12px" },
  brandRow: { display: "flex", alignItems: "center", gap: 14 },
  logo: { width: 44, height: 44, borderRadius: 10, background: "#1D9E75", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 },
  h1: { fontSize: 22, fontWeight: 600, margin: 0 },
  sub: { fontSize: 13, color: "var(--text-secondary)", margin: "2px 0 0" },
  logoutBtn: { border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "var(--text-secondary)" },
  nav: { display: "flex", gap: 4, padding: "0 16px", borderBottom: "0.5px solid var(--border)", flexWrap: "wrap", overflowX: "auto" },
  navBtn: { border: "none", background: "none", padding: "10px 14px", fontSize: 14, cursor: "pointer", color: "var(--text-secondary)", borderBottom: "2px solid transparent", whiteSpace: "nowrap" },
  navBtnActive: { color: "var(--text-primary)", fontWeight: 500, borderBottom: "2px solid #1D9E75" },
  main: { padding: "20px 16px 8px" },
  footer: { padding: "16px", fontSize: 12, color: "var(--text-muted)", borderTop: "0.5px solid var(--border)", marginTop: 20 },
  loading: { padding: 40, textAlign: "center", color: "var(--text-muted)" },
  loadingFull: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" },

  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 },
  metric: { background: "var(--surface-1)", borderRadius: 8, padding: "14px 16px" },
  metricLabel: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 },
  metricValue: { fontSize: 22, fontWeight: 600 },

  card: { background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "18px 20px", marginBottom: 20 },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" },
  h2: { fontSize: 16, fontWeight: 600, margin: "0 0 14px" },
  linkBtn: { border: "none", background: "none", color: "var(--text-accent)", cursor: "pointer", fontSize: 13, padding: 0 },

  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 },
  fieldLabel: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 },
  input: { width: "100%", height: 38, padding: "0 10px", borderRadius: 8, border: "0.5px solid var(--border-strong)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: 14 },
  miniInput: { width: 60, height: 30, padding: "0 6px", borderRadius: 6, border: "0.5px solid var(--border-strong)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: 13, textAlign: "right" },
  check: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", height: 38 },
  previewVal: { fontSize: 20, fontWeight: 600 },
  previewSmall: { fontSize: 16, fontWeight: 500, color: "var(--text-secondary)" },
  primaryBtn: { height: 38, padding: "0 20px", borderRadius: 8, border: "none", background: "#1D9E75", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" },

  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 500, borderBottom: "0.5px solid var(--border)", fontSize: 12 },
  thR: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 500, borderBottom: "0.5px solid var(--border)", fontSize: 12 },
  thC: { textAlign: "center", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 500, borderBottom: "0.5px solid var(--border)", fontSize: 12 },
  td: { padding: "9px 10px", borderBottom: "0.5px solid var(--border)" },
  tdR: { padding: "9px 10px", borderBottom: "0.5px solid var(--border)", textAlign: "right", fontVariantNumeric: "tabular-nums" },
  tdC: { padding: "9px 10px", borderBottom: "0.5px solid var(--border)", textAlign: "center" },
  empty: { padding: "24px 10px", textAlign: "center", color: "var(--text-muted)" },

  pill: { display: "inline-block", fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 6, marginRight: 6 },
  pillSelect: { fontSize: 12, fontWeight: 500, padding: "4px 8px", borderRadius: 6, border: "none", cursor: "pointer" },
  tinyBtn: { fontSize: 12, fontWeight: 500, padding: "3px 12px", borderRadius: 6, border: "0.5px solid var(--border)", cursor: "pointer" },
  delBtn: { border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 },
  toggleWrap: { display: "flex", border: "0.5px solid var(--border-strong)", borderRadius: 8, overflow: "hidden" },
  toggleBtn: { border: "none", background: "var(--surface-1)", padding: "7px 14px", fontSize: 13, cursor: "pointer", color: "var(--text-secondary)" },
  toggleBtnOn: { background: "#1D9E75", color: "#fff", fontWeight: 500 },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))", gap: 6 },
  calDay: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 46, borderRadius: 8, border: "0.5px solid var(--border-strong)", background: "var(--surface-1)", color: "var(--text-secondary)", fontSize: 14, cursor: "pointer", fontWeight: 500 },
  calDayOn: { background: "#1D9E75", color: "#fff", border: "0.5px solid #1D9E75" },
  pagoRow: { display: "flex", justifyContent: "space-between", fontSize: 14, padding: "5px 0", color: "var(--text-secondary)" },

  projGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 },
  projCard: { background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "16px 18px" },
  projHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  projId: { fontSize: 15, fontWeight: 600 },
  projCli: { fontSize: 13, color: "var(--text-secondary)" },
  projRow: { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0", color: "var(--text-secondary)" },
  barTrack: { height: 6, background: "var(--surface-1)", borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", background: "#1D9E75" },
  barLabel: { fontSize: 11, color: "var(--text-muted)", marginTop: 5 },

  loginPage: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  loginCard: { background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 360 },
  loginLogo: { width: 52, height: 52, borderRadius: 12, background: "#1D9E75", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, marginBottom: 16 },
  loginTitle: { fontSize: 20, fontWeight: 600, margin: 0 },
  loginSub: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" },
  loginError: { marginTop: 12, fontSize: 13, color: "var(--text-danger)", background: "var(--bg-danger)", padding: "8px 12px", borderRadius: 8 },
};

export default App;
