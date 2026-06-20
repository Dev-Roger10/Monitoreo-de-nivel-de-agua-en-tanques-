# Sistema de Monitoreo de Nivel de Agua — ESP32

Dashboard web en tiempo real para monitorear el nivel de agua en tanques domiciliarios mediante sensores ESP32, con datos históricos desde Google Sheets y alertas automáticas de rebose y bomba en seco.

## Características

- Monitoreo en tiempo real del nivel de agua (actualización cada 2 segundos)
- Alertas automáticas: rebose, nivel crítico, bomba en seco y consumo elevado
- Estadísticas por zona/distrito (Miraflores, Los Olivos, Villa El Salvador, SJL, Callao)
- Registro de patrones de consumo por hora y por fecha
- Dataset cargado desde Google Sheets con caché local como respaldo
- API REST con 6 endpoints JSON

## Estructura del proyecto

```
├── app.py              # Servidor Flask + simulación ESP32
├── requirements.txt    # Dependencias Python
├── Procfile            # Comando de inicio para Render
├── templates/
│   └── index.html      # Dashboard principal
├── static/
│   ├── css/style.css
│   └── js/app.js
└── datos/
    └── dataset.csv     # Caché local del Google Sheet
```

## API — Endpoints

| Método | Ruta        | Descripción                                              |
|--------|-------------|----------------------------------------------------------|
| GET    | `/`         | Dashboard HTML                                           |
| GET    | `/nivel`    | Lectura actual del sensor (nivel, porcentaje, consumo…)  |
| GET    | `/estado`   | Estado cualitativo del tanque (Normal / Precaución / Crítico / Rebose) |
| GET    | `/alertas`  | Alertas activas en este momento                          |
| GET    | `/zonas`    | Estadísticas agregadas por distrito                      |
| GET    | `/consumo`  | Patrones de consumo por hora y consumo diario total      |
| GET    | `/dataset`  | Todos los registros del Google Sheet como JSON           |

## Sensores ESP32 por zona

| Zona   | Distrito              | ID sensor   |
|--------|-----------------------|-------------|
| Centro | Miraflores            | ESP32-001   |
| Norte  | Los Olivos            | ESP32-002   |
| Sur    | Villa El Salvador     | ESP32-003   |
| Este   | San Juan de Lurigancho| ESP32-004   |
| Oeste  | Callao                | ESP32-005   |

## Ejecución local

```bash
# Instalar dependencias
pip install -r requirements.txt

# Iniciar servidor (puerto 5000 por defecto)
python app.py
```

Abre `http://localhost:5000` en el navegador.

## Despliegue en Render

1. Sube el repositorio a GitHub
2. En Render crea un nuevo **Web Service** apuntando al repo
3. Render detecta el `Procfile` automáticamente y usa:
   ```
   gunicorn app:app --workers 1 --threads 2
   ```
4. El puerto lo asigna Render via la variable de entorno `PORT` (ya configurado en `app.py`)

No se necesita configurar variables de entorno adicionales.

## Lógica de estados del tanque

| Porcentaje  | Estado      | Acción recomendada                          |
|-------------|-------------|---------------------------------------------|
| ≥ 90%       | Rebose      | Cerrar llave de entrada                     |
| 50% – 89%   | Normal      | Sin acción                                  |
| 20% – 49%   | Precaución  | Preparar recarga                            |
| 10% – 19%   | Crítico     | Recargar urgente                            |
| < 10%       | Crítico     | Detener bomba — riesgo de funcionamiento en seco |

## Dataset

El sistema descarga el dataset al iniciar desde Google Sheets (formato CSV export). Si no hay conexión, usa el archivo en caché `datos/dataset.csv`. Las columnas esperadas son:

`Zona`, `Sensor`, `Fecha`, `Hora`, `Nivel_L`, `Capacidad_L`, `Porcentaje`, `Consumo_L`, `Temp_C`
