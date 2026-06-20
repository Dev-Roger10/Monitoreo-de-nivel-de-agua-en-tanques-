
from flask import Flask, jsonify, render_template
import threading
import random
import time
import os
import csv
import urllib.request
from datetime import datetime

app = Flask(__name__)

# ─── Dataset desde Google Sheets ─────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
SHEET_ID  = "1f9BebxdmMfoEFkUk1yEfgd-Whs7exG46"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv"
CACHE_CSV = os.path.join(BASE_DIR, "datos", "dataset.csv")

# Mapeo zona → distrito peruano + ESP32 asignado
ZONAS = {
    "Centro": {"distrito": "Miraflores",            "esp32": "ESP32-001"},
    "Norte":  {"distrito": "Los Olivos",             "esp32": "ESP32-002"},
    "Sur":    {"distrito": "Villa El Salvador",      "esp32": "ESP32-003"},
    "Este":   {"distrito": "San Juan de Lurigancho", "esp32": "ESP32-004"},
    "Oeste":  {"distrito": "Callao",                 "esp32": "ESP32-005"},
}

def descargar_csv():
    os.makedirs(os.path.dirname(CACHE_CSV), exist_ok=True)
    try:
        urllib.request.urlretrieve(SHEET_URL, CACHE_CSV)
        print("[Dataset] Descargado desde Google Sheets.")
    except Exception as e:
        print(f"[Dataset] Sin conexión, usando caché local: {e}")

def cargar_dataset():
    if not os.path.exists(CACHE_CSV):
        descargar_csv()
    if not os.path.exists(CACHE_CSV):
        return []
    filas = []
    with open(CACHE_CSV, encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            try:
                fila["Nivel_L"]     = float(fila["Nivel_L"])
                fila["Porcentaje"]  = float(fila["Porcentaje"])
                fila["Capacidad_L"] = float(fila["Capacidad_L"])
                fila["Consumo_L"]   = float(fila["Consumo_L"])
                fila["Temp_C"]      = float(fila.get("Temp_C", 20.0))
                filas.append(fila)
            except (ValueError, KeyError):
                pass
    return filas

descargar_csv()
dataset = cargar_dataset()
print(f"[Dataset] {len(dataset)} registros cargados.")

# ─── Estado de la simulación (sensor ESP32 en vivienda) ──────────────────────
sim = {
    "indice":               0,
    "nivel_actual":         750.0,
    "capacidad_maxima":     1000,
    "porcentaje":           75.0,
    "consumo":              0.0,
    "temp_c":               20.0,
    "distrito":             "Miraflores",
    "zona":                 "Centro",
    "sensor":               "Tanque Principal",
    "esp32_id":             "ESP32-001",
    "rssi":                 -65,
    "estado":               "Normal",
    "alerta_bomba":         "Normal",
    "ultima_actualizacion": datetime.now().strftime("%H:%M:%S"),
    "historial":            [],
}

HISTORIAL_MAX = 30

def clasificar(pct: float) -> str:
    """
    OBJ-3: Analiza puntos críticos de desabastecimiento (Crítico) y
    sobrellenado (Rebose) que comprometen las bombas de agua.
    """
    if pct >= 90:
        return "Rebose"
    if pct >= 50:
        return "Normal"
    if pct >= 20:
        return "Precaución"
    return "Crítico"

def riesgo_bomba(pct: float) -> str:
    """
    Evalúa el riesgo de daño en la bomba por funcionamiento en seco.
    Causa identificada: falta de alertas automáticas en las bombas de agua.
    """
    if pct < 10:
        return "Funcionamiento en seco"
    if pct < 20:
        return "Riesgo alto"
    return "Normal"

def simular():
    """
    OBJ-1: Monitoreo en tiempo real del nivel de agua mediante sensor ESP32.
    OBJ-2: Registro de variaciones del nivel en distintos momentos del día.
    Cicla por los registros del dataset para simular lecturas del sensor.
    """
    while True:
        if dataset:
            fila       = dataset[sim["indice"] % len(dataset)]
            nivel      = fila["Nivel_L"]
            capacidad  = fila["Capacidad_L"]
            porcentaje = fila["Porcentaje"]
            consumo    = fila["Consumo_L"]
            temp_c     = fila.get("Temp_C", 20.0)
            zona       = str(fila.get("Zona", "Centro"))
            sensor     = str(fila.get("Sensor", "Tanque"))
            sim["indice"] += 1
        else:
            nivel      = max(0.0, sim["nivel_actual"] - random.uniform(5, 40))
            capacidad  = sim["capacidad_maxima"]
            porcentaje = (nivel / capacidad) * 100
            consumo    = random.uniform(5, 40)
            temp_c     = round(random.uniform(15.0, 30.0), 1)
            zona       = "Centro"
            sensor     = "Tanque Principal"

        info = ZONAS.get(zona, {"distrito": zona, "esp32": "ESP32-000"})

        sim["nivel_actual"]         = round(float(nivel), 1)
        sim["capacidad_maxima"]     = int(capacidad)
        sim["porcentaje"]           = round(float(porcentaje), 1)
        sim["consumo"]              = round(float(consumo), 1)
        sim["temp_c"]               = round(float(temp_c), 1)
        sim["distrito"]             = info["distrito"]
        sim["zona"]                 = zona
        sim["sensor"]               = sensor
        sim["esp32_id"]             = info["esp32"]
        sim["rssi"]                 = random.randint(-80, -42)
        sim["estado"]               = clasificar(float(porcentaje))
        sim["alerta_bomba"]         = riesgo_bomba(float(porcentaje))
        sim["ultima_actualizacion"] = datetime.now().strftime("%H:%M:%S")

        sim["historial"].append({
            "tiempo":     sim["ultima_actualizacion"],
            "nivel":      sim["nivel_actual"],
            "porcentaje": sim["porcentaje"],
            "consumo":    sim["consumo"],
        })
        if len(sim["historial"]) > HISTORIAL_MAX:
            sim["historial"].pop(0)

        time.sleep(2)

# ─── Rutas de la API ──────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/nivel")
def obtener_nivel():
    """GET /nivel — Lectura actual del sensor ESP32 en el tanque domiciliario."""
    return jsonify({
        "nivel_actual":         sim["nivel_actual"],
        "capacidad_maxima":     sim["capacidad_maxima"],
        "porcentaje":           sim["porcentaje"],
        "consumo":              sim["consumo"],
        "temp_c":               sim["temp_c"],
        "distrito":             sim["distrito"],
        "zona":                 sim["zona"],
        "sensor":               sim["sensor"],
        "esp32_id":             sim["esp32_id"],
        "rssi":                 sim["rssi"],
        "estado":               sim["estado"],
        "alerta_bomba":         sim["alerta_bomba"],
        "ultima_actualizacion": sim["ultima_actualizacion"],
        "historial":            sim["historial"],
    })


@app.route("/estado")
def obtener_estado():
    """GET /estado — Estado cualitativo del nivel del tanque."""
    return jsonify({
        "estado":               sim["estado"],
        "nivel_actual":         sim["nivel_actual"],
        "porcentaje":           sim["porcentaje"],
        "alerta_bomba":         sim["alerta_bomba"],
        "ultima_actualizacion": sim["ultima_actualizacion"],
    })


@app.route("/alertas")
def obtener_alertas():
    """
    GET /alertas — Alertas automáticas activas del sistema.
    OBJ-3: Alerta de rebose y bomba en seco.
    OBJ-4: Detección de desperdicio por consumo elevado.
    Causa resuelta: falta de notificación de tanque lleno o vacío.
    """
    alertas = []
    pct     = sim["porcentaje"]
    consumo = sim["consumo"]

    if pct >= 90:
        alertas.append({
            "tipo":    "rebose",
            "nivel":   "critico",
            "icono":   "fa-water",
            "mensaje": "Riesgo de rebose — Cierre la llave de entrada del tanque para evitar derrame",
        })
    if pct < 10:
        alertas.append({
            "tipo":    "bomba_seco",
            "nivel":   "critico",
            "icono":   "fa-plug-circle-xmark",
            "mensaje": "Bomba en riesgo de funcionar en seco — Detenga la bomba inmediatamente",
        })
    elif pct < 20:
        alertas.append({
            "tipo":    "nivel_critico",
            "nivel":   "critico",
            "icono":   "fa-circle-exclamation",
            "mensaje": "Nivel crítico de agua — Se requiere recarga urgente del tanque",
        })
    if consumo > 70:
        alertas.append({
            "tipo":    "consumo_alto",
            "nivel":   "precaucion",
            "icono":   "fa-faucet-drip",
            "mensaje": f"Consumo elevado: {consumo} L — Posible desperdicio de agua o fuga detectada",
        })

    return jsonify({
        "alertas":      alertas,
        "total":        len(alertas),
        "estado_bomba": sim["alerta_bomba"],
    })


@app.route("/dataset")
def obtener_dataset():
    """GET /dataset — Todos los registros del Google Sheet como JSON."""
    return jsonify(dataset)


@app.route("/zonas")
def obtener_zonas():
    """GET /zonas — Estadísticas de nivel de agua agregadas por distrito."""
    from collections import defaultdict

    grupos: dict = defaultdict(lambda: {"niveles": [], "porcentajes": [], "consumos": [], "capacidad": 1000})
    for fila in dataset:
        zona = str(fila.get("Zona", ""))
        grupos[zona]["niveles"].append(fila["Nivel_L"])
        grupos[zona]["porcentajes"].append(fila["Porcentaje"])
        grupos[zona]["consumos"].append(fila["Consumo_L"])
        grupos[zona]["capacidad"] = int(fila["Capacidad_L"])

    resultado = []
    for zona, g in grupos.items():
        info         = ZONAS.get(zona, {"distrito": zona, "esp32": "ESP32-000"})
        porcentajes  = g["porcentajes"]
        niveles      = g["niveles"]
        ultimo_pct   = porcentajes[-1]
        criticos     = sum(1 for p in porcentajes if p < 20)
        precauciones = sum(1 for p in porcentajes if 20 <= p < 50)
        reboses      = sum(1 for p in porcentajes if p >= 90)

        resultado.append({
            "zona":             zona,
            "distrito":         info["distrito"],
            "esp32_id":         info["esp32"],
            "capacidad":        g["capacidad"],
            "promedio_pct":     round(sum(porcentajes) / len(porcentajes), 1),
            "promedio_nivel":   round(sum(niveles) / len(niveles), 1),
            "max_nivel":        round(max(niveles), 1),
            "min_nivel":        round(min(niveles), 1),
            "ultimo_nivel":     round(niveles[-1], 1),
            "ultimo_pct":       round(ultimo_pct, 1),
            "ultimo_estado":    clasificar(ultimo_pct),
            "consumo_promedio": round(sum(g["consumos"]) / len(g["consumos"]), 1),
            "total_registros":  len(niveles),
            "criticos":         criticos,
            "precauciones":     precauciones,
            "reboses":          reboses,
        })
    return jsonify(resultado)


@app.route("/consumo")
def obtener_consumo():
    """
    GET /consumo — Patrones de consumo por hora del día y consumo diario total.
    OBJ-2: Registrar variaciones del nivel en distintos momentos del día.
    OBJ-5: Reducir consumo innecesario — identifica horas de mayor desperdicio.
    Causa resuelta: desconocimiento del consumo de agua que afecta la vida en el hogar.
    """
    from collections import defaultdict

    por_hora  = defaultdict(list)
    por_fecha = defaultdict(float)

    for fila in dataset:
        hora  = fila.get("Hora", "00:00")
        fecha = fila.get("Fecha", "")
        try:
            hora_h = int(str(hora).split(":")[0])
        except (ValueError, AttributeError):
            hora_h = 0
        por_hora[hora_h].append(fila["Consumo_L"])
        por_fecha[str(fecha)] += fila["Consumo_L"]

    patrones_hora = [
        {
            "hora":             h,
            "consumo_promedio": round(sum(v) / len(v), 1),
            "registros":        len(v),
        }
        for h, v in sorted(por_hora.items())
    ]

    consumo_diario = [
        {"fecha": f, "total": round(t, 1)}
        for f, t in sorted(por_fecha.items())
    ]

    return jsonify({
        "patrones_hora":   patrones_hora,
        "consumo_diario":  consumo_diario,
        "total_registros": len(dataset),
    })


# ─── Hilo de simulación (arranca siempre, también bajo gunicorn) ──────────────
hilo = threading.Thread(target=simular, daemon=True)
hilo.start()

# ─── Punto de entrada ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, use_reloader=False, port=port)
