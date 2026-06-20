'use strict';

// ─── Estados del nivel de agua ────────────────────────────────────────────────
// Causa resuelta: falta de alertas automáticas — el sistema ahora distingue
// 4 estados: Rebose (≥90%), Normal, Precaución, Crítico (<20%)
const ESTADOS = {
    "Rebose": {
        colorLinea:  "#3b82f6",
        colorFondo:  "rgba(59, 130, 246, 0.10)",
        colorBarra:  "linear-gradient(90deg, #1d4ed8, #3b82f6)",
        clase:       "rebose",
        icono:       '<i class="fa-solid fa-water"></i>',
        titulo:      "Riesgo de Rebose",
        descripcion: "El tanque está al límite. Cierre la llave de entrada para evitar derrames y daños por presión."
    },
    "Normal": {
        colorLinea:  "#22c55e",
        colorFondo:  "rgba(34, 197, 94, 0.10)",
        colorBarra:  "linear-gradient(90deg, #22c55e, #4ade80)",
        clase:       "normal",
        icono:       '<i class="fa-solid fa-circle-check"></i>',
        titulo:      "Nivel Normal",
        descripcion: "El tanque tiene agua suficiente. No se requiere ninguna acción."
    },
    "Precaución": {
        colorLinea:  "#eab308",
        colorFondo:  "rgba(234, 179, 8, 0.10)",
        colorBarra:  "linear-gradient(90deg, #eab308, #facc15)",
        clase:       "precaucion",
        icono:       '<i class="fa-solid fa-triangle-exclamation"></i>',
        titulo:      "Nivel en Precaución",
        descripcion: "El nivel de agua es bajo. Se recomienda reducir el consumo y preparar recarga."
    },
    "Crítico": {
        colorLinea:  "#ef4444",
        colorFondo:  "rgba(239, 68, 68, 0.10)",
        colorBarra:  "linear-gradient(90deg, #ef4444, #f87171)",
        clase:       "critico",
        icono:       '<i class="fa-solid fa-circle-exclamation"></i>',
        titulo:      "Nivel Crítico",
        descripcion: "¡Agua muy baja! Riesgo de funcionamiento en seco de la bomba. Recarga urgente."
    }
};

// ─── Gráfico Chart.js (nivel en %) ────────────────────────────────────────────
const ctx     = document.getElementById('graficoNivel').getContext('2d');
const grafico = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Nivel del tanque (%)',
            data: [],
            borderColor:      '#22c55e',
            backgroundColor:  'rgba(34, 197, 94, 0.10)',
            borderWidth:      2.5,
            pointRadius:      3,
            pointHoverRadius: 6,
            fill:    true,
            tension: 0.4
        }]
    },
    options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { intersect: false, mode: 'index' },
        scales: {
            x: {
                ticks: { color: '#94a3b8', maxTicksLimit: 10, font: { size: 11 } },
                grid:  { color: 'rgba(51, 65, 85, 0.6)' }
            },
            y: {
                min: 0,
                max: 100,
                ticks: {
                    color: '#94a3b8',
                    callback: v => v + ' %',
                    font: { size: 11 }
                },
                grid: { color: 'rgba(51, 65, 85, 0.6)' }
            }
        },
        plugins: {
            legend: { labels: { color: '#f1f5f9', font: { size: 12 } } },
            tooltip: {
                callbacks: { label: item => ` ${item.parsed.y.toFixed(1)} %` }
            }
        }
    }
});

// ─── Actualizar toda la interfaz ──────────────────────────────────────────────
function actualizarInterfaz(datos, estado) {
    const cfg = ESTADOS[estado] || ESTADOS["Normal"];

    // Tarjetas principales
    document.getElementById('nivelActual').textContent       = datos.nivel_actual.toLocaleString('es-PE', { maximumFractionDigits: 1 });
    document.getElementById('porcentaje').textContent        = datos.porcentaje.toFixed(1);
    document.getElementById('capacidadMax').textContent      = datos.capacidad_maxima.toLocaleString('es-PE');
    document.getElementById('horaActualizacion').textContent = datos.ultima_actualizacion;

    // Tarjetas nuevas: consumo y temperatura
    if (datos.consumo !== undefined)
        document.getElementById('consumoActual').textContent = datos.consumo.toLocaleString('es-PE', { maximumFractionDigits: 1 });
    if (datos.temp_c !== undefined)
        document.getElementById('tempActual').textContent = datos.temp_c.toFixed(1);

    document.getElementById('nivelActual').className = `card-valor color-${cfg.clase}`;
    document.getElementById('porcentaje').className  = `card-valor color-${cfg.clase}`;

    // Barra de nivel (0–100 %)
    const barra = document.getElementById('progresoBarra');
    barra.style.width      = datos.porcentaje + '%';
    barra.style.background = cfg.colorBarra;
    document.getElementById('progresoLabel').textContent = datos.porcentaje.toFixed(1) + ' %';

    // Badge
    const badge = document.getElementById('estadoBadge');
    badge.textContent = estado;
    badge.className   = `estado-badge ${cfg.clase}`;

    // Panel de estado
    document.getElementById('seccionEstado').className  = `seccion-estado ${cfg.clase}`;
    document.getElementById('estadoIcono').innerHTML    = cfg.icono;
    document.getElementById('estadoTitulo').textContent = cfg.titulo;
    document.getElementById('estadoDesc').textContent   = cfg.descripcion;

    // Info ESP32
    document.getElementById('esp32Id').textContent       = datos.esp32_id;
    document.getElementById('esp32Rssi').textContent     = `${datos.rssi} dBm`;
    document.getElementById('esp32Distrito').textContent = datos.distrito;

    // Gráfico (porcentaje)
    grafico.data.datasets[0].borderColor     = cfg.colorLinea;
    grafico.data.datasets[0].backgroundColor = cfg.colorFondo;
    grafico.data.labels.push(datos.ultima_actualizacion);
    grafico.data.datasets[0].data.push(datos.porcentaje);
    if (grafico.data.labels.length > 30) {
        grafico.data.labels.shift();
        grafico.data.datasets[0].data.shift();
    }
    grafico.update();
}

// ─── Consulta a la API de nivel ───────────────────────────────────────────────
async function consultarAPI() {
    try {
        const [respNivel, respEstado] = await Promise.all([
            fetch('/nivel'),
            fetch('/estado')
        ]);
        if (!respNivel.ok || !respEstado.ok)
            throw new Error(`Error: ${respNivel.status} / ${respEstado.status}`);
        const datosNivel  = await respNivel.json();
        const datosEstado = await respEstado.json();
        actualizarInterfaz(datosNivel, datosEstado.estado);
    } catch (e) {
        console.error('[MonitorAgua] Error al consultar API:', e);
    }
}

consultarAPI();
setInterval(consultarAPI, 2000);

// ═══════════════════════════════════════════════════════════════════════════════
// ALERTAS AUTOMÁTICAS
// OBJ-3: Rebose y bomba en seco | OBJ-4: Desperdicio por consumo alto
// Causa resuelta: falta de notificación automática de tanque lleno o vacío
// ═══════════════════════════════════════════════════════════════════════════════

async function cargarAlertas() {
    try {
        const resp = await fetch('/alertas');
        if (!resp.ok) throw new Error('Error alertas');
        const data = await resp.json();
        renderizarAlertas(data);
    } catch (e) {
        console.error('[Alertas] Error:', e);
    }
}

function renderizarAlertas(data) {
    const seccion = document.getElementById('seccionAlertas');
    const lista   = document.getElementById('alertasLista');

    if (data.alertas.length === 0) {
        seccion.style.display = 'none';
        return;
    }

    seccion.style.display = 'block';
    lista.innerHTML = data.alertas.map(a => `
        <div class="alerta-item alerta-${a.nivel}">
            <i class="fa-solid ${a.icono}"></i>
            <span>${a.mensaje}</span>
        </div>
    `).join('');
}

cargarAlertas();
setInterval(cargarAlertas, 2000);

// ═══════════════════════════════════════════════════════════════════════════════
// CONSUMO POR HORA DEL DÍA
// OBJ-2: Registrar variaciones del nivel en distintos momentos del día
// OBJ-5: Reducir consumo innecesario — detecta horas pico de desperdicio
// Causa resuelta: desconocimiento del consumo de agua que afecta el hogar
// ═══════════════════════════════════════════════════════════════════════════════

let graficoConsumo = null;

async function cargarConsumo() {
    try {
        const resp = await fetch('/consumo');
        if (!resp.ok) throw new Error('Error consumo');
        const data = await resp.json();
        renderizarGraficoConsumo(data.patrones_hora);
    } catch (e) {
        console.error('[Consumo] Error:', e);
    }
}

function renderizarGraficoConsumo(patrones) {
    const labels = patrones.map(p => `${String(p.hora).padStart(2, '0')}:00`);
    const vals   = patrones.map(p => p.consumo_promedio);

    // Colores: rojo = pico alto (>70 L, posible desperdicio), ámbar = medio, cian = bajo
    const coloresFondo  = vals.map(v => v > 70 ? 'rgba(239,68,68,0.45)'  : v > 50 ? 'rgba(234,179,8,0.40)' : 'rgba(56,189,248,0.35)');
    const coloresBorde  = vals.map(v => v > 70 ? '#ef4444'                : v > 50 ? '#eab308'              : '#38bdf8');

    const ctxC = document.getElementById('graficoConsumo').getContext('2d');
    if (graficoConsumo) graficoConsumo.destroy();

    graficoConsumo = new Chart(ctxC, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label:           'Consumo Promedio (L)',
                    data:            vals,
                    backgroundColor: coloresFondo,
                    borderColor:     coloresBorde,
                    borderWidth:     2,
                    borderRadius:    5,
                },
                {
                    label:           'Umbral desperdicio (70 L)',
                    data:            Array(labels.length).fill(70),
                    type:            'line',
                    borderColor:     'rgba(239,68,68,0.50)',
                    backgroundColor: 'transparent',
                    borderWidth:     1.5,
                    borderDash:      [6, 4],
                    pointRadius:     0,
                    order:           0,
                }
            ]
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            animation:           { duration: 600 },
            interaction:         { intersect: false, mode: 'index' },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', font: { size: 11 } },
                    grid:  { color: 'rgba(51,65,85,0.5)' }
                },
                y: {
                    ticks: {
                        color:    '#94a3b8',
                        callback: v => v + ' L',
                        font:     { size: 11 }
                    },
                    grid: { color: 'rgba(51,65,85,0.5)' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f1f5f9', font: { size: 12 }, boxWidth: 14 } },
                tooltip: {
                    callbacks: { label: item => ` ${item.dataset.label}: ${Number(item.parsed.y).toFixed(1)} L` }
                }
            }
        }
    });
}

cargarConsumo();

// ═══════════════════════════════════════════════════════════════════════════════
// VISUALIZACIÓN POR ZONA / DISTRITO
// ═══════════════════════════════════════════════════════════════════════════════

let graficoZonas = null;

async function cargarZonas() {
    try {
        const resp = await fetch('/zonas');
        if (!resp.ok) throw new Error('Error al cargar zonas');
        const zonas = await resp.json();
        renderizarGraficoZonas(zonas);
        renderizarTarjetasZonas(zonas);
    } catch (e) {
        console.error('[Zonas] Error:', e);
        document.getElementById('zonasGrid').innerHTML =
            '<p class="dataset-cargando">No se pudieron cargar los datos.</p>';
    }
}

function colorPorEstado(estado) {
    return estado === 'Normal'    ? '#22c55e'
         : estado === 'Rebose'    ? '#3b82f6'
         : estado === 'Precaución' ? '#eab308'
         : '#ef4444';
}

function renderizarGraficoZonas(zonas) {
    const labels    = zonas.map(z => z.distrito);
    const promedios = zonas.map(z => z.promedio_pct);
    const colores   = zonas.map(z => colorPorEstado(z.ultimo_estado));
    const n         = zonas.length;

    const ctxZ = document.getElementById('graficoZonas').getContext('2d');
    if (graficoZonas) graficoZonas.destroy();

    graficoZonas = new Chart(ctxZ, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label:           'Nivel Promedio (%)',
                    data:            promedios,
                    backgroundColor: colores.map(c => c + '33'),
                    borderColor:     colores,
                    borderWidth:     2,
                    borderRadius:    6,
                    order:           1,
                },
                {
                    label:           'Nivel Normal (50 %)',
                    data:            Array(n).fill(50),
                    type:            'line',
                    borderColor:     '#22c55e55',
                    backgroundColor: 'transparent',
                    borderWidth:     1.5,
                    borderDash:      [6, 4],
                    pointRadius:     0,
                    order:           0,
                },
                {
                    label:           'Nivel Crítico (20 %)',
                    data:            Array(n).fill(20),
                    type:            'line',
                    borderColor:     '#ef444455',
                    backgroundColor: 'transparent',
                    borderWidth:     1.5,
                    borderDash:      [6, 4],
                    pointRadius:     0,
                    order:           0,
                },
                {
                    label:           'Umbral Rebose (90 %)',
                    data:            Array(n).fill(90),
                    type:            'line',
                    borderColor:     '#3b82f655',
                    backgroundColor: 'transparent',
                    borderWidth:     1.5,
                    borderDash:      [6, 4],
                    pointRadius:     0,
                    order:           0,
                },
            ]
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            animation:           { duration: 600 },
            interaction:         { intersect: false, mode: 'index' },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', font: { size: 11 } },
                    grid:  { color: 'rgba(51, 65, 85, 0.5)' }
                },
                y: {
                    min: 0, max: 100,
                    ticks: {
                        color:    '#94a3b8',
                        callback: v => v + ' %',
                        font:     { size: 11 }
                    },
                    grid: { color: 'rgba(51, 65, 85, 0.5)' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f1f5f9', font: { size: 12 }, boxWidth: 14 } },
                tooltip: {
                    callbacks: { label: item => ` ${item.dataset.label}: ${Number(item.parsed.y).toFixed(1)} %` }
                }
            }
        }
    });
}

function renderizarTarjetasZonas(zonas) {
    const grid = document.getElementById('zonasGrid');
    grid.innerHTML = zonas.map(z => {
        const cls   = z.ultimo_estado === 'Normal'     ? 'normal'
                    : z.ultimo_estado === 'Rebose'      ? 'rebose'
                    : z.ultimo_estado === 'Precaución'  ? 'precaucion'
                    : 'critico';
        const icono = z.ultimo_estado === 'Normal'     ? 'fa-circle-check'
                    : z.ultimo_estado === 'Rebose'      ? 'fa-water'
                    : z.ultimo_estado === 'Precaución'  ? 'fa-triangle-exclamation'
                    : 'fa-circle-exclamation';
        const color = colorPorEstado(z.ultimo_estado);

        const rebosesTag = z.reboses > 0
            ? `<span><i class="fa-solid fa-water" style="color:#3b82f6"></i> ${z.reboses} rebose${z.reboses > 1 ? 's' : ''}</span>`
            : '';

        return `
        <div class="zona-card zona-${cls}">
            <div class="zona-header">
                <span class="zona-nombre">${z.distrito}</span>
                <span class="estado-tag ${cls}">
                    <i class="fa-solid ${icono}"></i> ${z.ultimo_estado}
                </span>
            </div>
            <div class="zona-nivel color-${cls}">${z.ultimo_pct.toFixed(1)}<span class="zona-unit"> %</span></div>
            <div class="zona-sub">${z.ultimo_nivel.toLocaleString('es-PE', {maximumFractionDigits:0})} L de ${z.capacidad.toLocaleString('es-PE')} L</div>
            <div class="zona-barra-contenedor">
                <div class="zona-barra" style="width:${Math.min(z.ultimo_pct,100).toFixed(1)}%; background:${color}55; border:1px solid ${color}88"></div>
            </div>
            <div class="zona-stats">
                <span><i class="fa-solid fa-arrow-up" style="color:#38bdf8"></i> ${z.max_nivel.toLocaleString('es-PE',{maximumFractionDigits:0})} L</span>
                <span><i class="fa-solid fa-arrow-down" style="color:#94a3b8"></i> ${z.min_nivel.toLocaleString('es-PE',{maximumFractionDigits:0})} L</span>
                <span><i class="fa-solid fa-triangle-exclamation" style="color:#eab308"></i> ${z.precauciones} precauc.</span>
                <span><i class="fa-solid fa-circle-exclamation" style="color:#ef4444"></i> ${z.criticos} crít.</span>
                ${rebosesTag}
            </div>
            <div class="zona-footer">
                <code class="esp32-code">${z.esp32_id}</code>
                <span>${z.total_registros} registros</span>
            </div>
        </div>`;
    }).join('');
}

cargarZonas();
