/* =======================================================
   MQTT CONFIGURATION
======================================================= */
const MQTT_HOST = "wss://bd509ffdc87145cfa13d726940b34f83.s1.eu.hivemq.cloud:8884/mqtt";
const MQTT_USER = "esp32_user";
const MQTT_PASS = "Dove11111";

/* SENSOR DATA */
let weatherData = {
    temperature: 0,
    humidity: 0,
    pressure: 0,
    light: 0,
    rainIntensity: 0,
    isRaining: false,
    isDay: true,
    windSpeed: 0,
    windDirectionDeg: 0,
    windDirectionCompass: "--"
};

/* MIN / MAX TRACKING */
let dailyStats = {
    tempMin: null, tempMax: null,
    humMin: null, humMax: null,
    lightMin: null, lightMax: null
};
let dailyAvg = {
    tempSum: 0, tempCount: 0,
    humSum: 0, humCount: 0,
    lightSum: 0, lightCount: 0
};  

/* SENSOR HEALTH TIMESTAMPS */
let sensorSeen = {
    temperature: 0, humidity: 0,
    pressure: 0, light: 0, rain: 0
};

/* LED CONTROL */
let ledState = false;
let manualMode = false;
const LED_TOPIC = "esp32/led/control";
const LUX_THRESHOLD = 200;

/* =======================================================
   MQTT INIT
======================================================= */
const client = mqtt.connect(MQTT_HOST, {
    username: MQTT_USER,
    password: MQTT_PASS,
    reconnectPeriod: 3000
});

client.on("connect", () => {
    console.log("MQTT Connected");
    client.subscribe("esp32/sensor/#");
    client.subscribe("esp32/led/status");
    client.subscribe("esp32/mode/status");
});

/* =======================================================
   MQTT MESSAGE HANDLER
======================================================= */
client.on("message", (topic, msg) => {
    const value = msg.toString();
    const now = Date.now();

    switch (topic) {

        case "esp32/sensor/temperature":
            weatherData.temperature = parseFloat(value);
            sensorSeen.temperature = now;
            updateMinMax("temp", weatherData.temperature);
            break;

        case "esp32/sensor/humidity":
            weatherData.humidity = parseFloat(value);
            sensorSeen.humidity = now;
            updateMinMax("hum", weatherData.humidity);
            break;

        case "esp32/sensor/pressure":
            weatherData.pressure = parseFloat(value);
            sensorSeen.pressure = now;
            break;

        case "esp32/sensor/light":
            weatherData.light = parseFloat(value);
            weatherData.isDay = weatherData.light >= 200;
            sensorSeen.light = now;
            updateMinMax("light", weatherData.light);
            break;

        case "esp32/sensor/rain":
            weatherData.isRaining = value === "1";
            sensorSeen.rain = now;
            break;

        case "esp32/sensor/rain_intensity":
            weatherData.rainIntensity = Math.min(100, Math.max(0, parseInt(value)));
            break;

        case "esp32/led/status":
            ledState = value === "1";
            break;
        case "esp32/sensor/wind_speed_kmh":
            weatherData.windSpeed = parseFloat(value);
            break;

        case "esp32/sensor/wind_direction_deg":
            weatherData.windDirectionDeg = parseInt(value);
            break;

        case "esp32/sensor/wind_direction_compass":
            weatherData.windDirectionCompass = value;
            break;
        case "esp32/mode/status":
            manualMode = (value === "manual");
            break;
    }

    updateUI();
});

/* =======================================================
   MIN / MAX TRACKER
======================================================= */
function updateMinMax(type, value) {
    if (type === "temp") {
        dailyStats.tempMin = dailyStats.tempMin === null ? value : Math.min(dailyStats.tempMin, value);
        dailyStats.tempMax = dailyStats.tempMax === null ? value : Math.max(dailyStats.tempMax, value);
    }

    if (type === "hum") {
        dailyStats.humMin = dailyStats.humMin === null ? value : Math.min(dailyStats.humMin, value);
        dailyStats.humMax = dailyStats.humMax === null ? value : Math.max(dailyStats.humMax, value);
    }

    if (type === "light") {
        dailyStats.lightMin = dailyStats.lightMin === null ? value : Math.min(dailyStats.lightMin, value);
        dailyStats.lightMax = dailyStats.lightMax === null ? value : Math.max(dailyStats.lightMax, value);
    }
}

/* =======================================================
   REAL WORLD PROGRESS BAR COLORS
======================================================= */
function applyRealWorldColor(element, type, value) {
    element.className = "progress-fill";

    switch(type) {

        /* Temperature */
        case "temp":
            if (value < 10) element.classList.add("temp-cold");
            else if (value < 25) element.classList.add("temp-cool");
            else if (value < 35) element.classList.add("temp-warm");
            else element.classList.add("temp-hot");
            break;

        /* Humidity */
        case "humidity":
            if (value < 30) element.classList.add("hum-dry");
            else if (value < 60) element.classList.add("hum-ideal");
            else element.classList.add("hum-humid");
            break;

        /* Light */
        case "light":
            if (value < 50) element.classList.add("light-night");
            else if (value < 300) element.classList.add("light-dawn");
            else if (value < 2000) element.classList.add("light-day");
            else element.classList.add("light-bright");
            break;

        /* Rain intensity */
        case "rain":
            if (value < 20) element.classList.add("rain-none");
            else if (value < 60) element.classList.add("rain-light");
            else element.classList.add("rain-heavy");
            break;

        case "wind":
            if (value < 5) element.classList.add("wind-calm");
            else if (value < 20) element.classList.add("wind-breezy");
            else if (value < 40) element.classList.add("wind-windy");
            else element.classList.add("wind-strong");
            break;
    }
}

/* =======================================================
   ICON + TEXT LOGIC FOR STATUS CARDS
======================================================= */
function getDayNightIcon() {
    if (!weatherData.isDay) return "moon";
    if (weatherData.light < 300 && weatherData.light > 50) return "sunrise";
    return "sun";
}

function getRainIcon() {
    const r = weatherData.rainIntensity;
    if (r === 0) return "cloud";
    if (r <= 30) return "cloud-drizzle";
    if (r <= 60) return "cloud-rain";
    return "cloud-lightning";
}

function getRainLabel() {
    const r = weatherData.rainIntensity;

    if (r === 0) return "Dry";
    if (r <= 15) return "Very Light Rain";
    if (r <= 30) return "Light Rain";
    if (r <= 60) return "Moderate Rain";
    if (r <= 80) return "Heavy Rain";
    return "Storm";
}

/* =======================================================
   THEME SWITCHING
======================================================= */
function applyTheme() {
    const lux = weatherData.light;

    // 🌧 PRIORITY: Rain overrides all themes
    if (weatherData.isRaining || weatherData.rainIntensity > 20) {
        document.body.className = "theme-rain";
        return;
    }

    // ☀ Normal light-based themes
    if (lux < 50) document.body.className = "theme-night";
    else if (lux < 200) document.body.className = "theme-dawn";
    else if (lux < 1000) document.body.className = "theme-day";
    else document.body.className = "theme-bright";
}


/* =======================================================
   HERO UPDATE
======================================================= */
function updateHero() {
    const icon = document.getElementById("heroIcon");
    const temp = document.getElementById("heroTemp");
    const desc = document.getElementById("heroDesc");

    if (!icon || !temp || !desc) return;

    temp.textContent = weatherData.temperature.toFixed(1) + "°C";

    const hour = new Date().getHours();
    let symbol = "☀", label = "Daytime";

    if      (hour < 5 || hour >= 19) symbol = "🌙", label = "Night";
    else if (hour < 7)               symbol = "🌅", label = "Dawn";
    else if (hour >= 17)             symbol = "🌇", label = "Sunset";

    if (weatherData.rainIntensity > 70) symbol = "⛈", label = "Heavy Rain";
    else if (weatherData.rainIntensity > 20) symbol = "🌧", label = "Rainy";

    icon.textContent = symbol;
    desc.textContent = label;
}

/* =======================================================
   SENSOR HEALTH
======================================================= */
function updateSensorHealth() {
    const now = Date.now();
    const timeout = 15000;

    const ok = ts => (now - ts < timeout ? "🟢 OK" : "🔴 Offline");

    if (document.getElementById("sTemp"))     document.getElementById("sTemp").textContent = ok(sensorSeen.temperature);
    if (document.getElementById("sHumidity")) document.getElementById("sHumidity").textContent = ok(sensorSeen.humidity);
    if (document.getElementById("sPressure")) document.getElementById("sPressure").textContent = ok(sensorSeen.pressure);
    if (document.getElementById("sLight"))    document.getElementById("sLight").textContent = ok(sensorSeen.light);
    if (document.getElementById("sRain"))     document.getElementById("sRain").textContent = ok(sensorSeen.rain);

    if (document.getElementById("sLED"))
        document.getElementById("sLED").textContent = ledState ? "🟡 ON" : "⚫ OFF";
}

/* =======================================================
   MANUAL MODE
======================================================= */
function toggleManualMode() {
    manualMode = document.getElementById("manualModeSwitch").checked;

    // SEND MODE TO ESP (IMPORTANT)
    client.publish("esp32/led/mode", manualMode ? "manual" : "auto", { qos: 1 });

    // Immediately apply state locally (fixes UI override)
    if (manualMode) {
        document.getElementById("ledPowerSwitch").disabled = false;
    } else {
        document.getElementById("ledPowerSwitch").disabled = true;
    }

    updateUI();
}

/* =======================================================
   MANUAL LED CONTROL
======================================================= */
function manualSetLED() {
    if (!manualMode) return;

    const isOn = document.getElementById("ledPowerSwitch").checked;
    client.publish(LED_TOPIC, isOn ? "1" : "0");
    ledState = isOn;

    updateUI();
}

/* =======================================================
   AUTO LED CONTROL
======================================================= */
function updateAutoLED() {

}

/* =======================================================
   MAIN UI UPDATE
======================================================= */
function updateUI() {

    applyTheme();
    updateHero();
    updateSensorHealth();

    /* LED Status */
    if (document.getElementById("ledStatusText"))
        document.getElementById("ledStatusText").textContent =
            ledState ? "🟡 ON" : "⚫ OFF";

    if (manualMode && document.getElementById("ledPowerSwitch"))
        document.getElementById("ledPowerSwitch").checked = ledState;

    if (!document.getElementById("tempValue")) return;

    
    /* -------- DASHBOARD VALUES -------- */
    const now = new Date();

    document.getElementById("lastUpdate").innerHTML =
    `Time: ${now.toLocaleTimeString()}<br><span class="date-text">Date: ${now.toLocaleDateString()}</span>`;
    document.getElementById("tempValue").textContent =
        weatherData.temperature.toFixed(1) + "°C";
    document.getElementById("humidityValue").textContent =
        weatherData.humidity.toFixed(0) + "%";
    document.getElementById("pressureValue").textContent =
        weatherData.pressure.toFixed(1) + " hPa";
    document.getElementById("lightValue").textContent =
        weatherData.light.toFixed(0) + " lux";
    document.getElementById("rainIntensityValue").textContent =
        weatherData.rainIntensity + "%";

    // Mini Monitor Updates
    document.getElementById("feelsLikeValue").textContent =
        weatherData.temperature.toFixed(1) + "°C";

    document.getElementById("humidityMini").textContent =
        weatherData.humidity.toFixed(0) + "%";

    document.getElementById("windMini").textContent =
        weatherData.windSpeed.toFixed(1) + " km/h"; 
    // WIND UI UPDATE
    document.getElementById("windValue").textContent =
        weatherData.windSpeed.toFixed(1) + " km/h";

    document.getElementById("windDirection").textContent =
        weatherData.windDirectionDeg + "° " + weatherData.windDirectionCompass;

    document.getElementById("windCenterSpeed").innerHTML =
        weatherData.windSpeed.toFixed(0) + "<br><small>km/h</small>";

    // ROTATE ARROW
    const arrow = document.getElementById("windArrow");
    arrow.style.transform = "rotate(" + weatherData.windDirectionDeg + "deg)";

    /* -------- STATUS CARDS WITH ICON + TEXT -------- */

    /* DAY/NIGHT CARD */
    let lux = weatherData.light;
let label = "Daylight";
let icon = "sun";

if (lux < 30) {
    label = "Dark";
    icon = "moon";
}
else if (lux < 150) {
    label = "Dim";
    icon = "sunrise";
}
else if (lux < 1000) {
    label = "Daylight";
    icon = "sun";
}
else {
    label = "Bright";
    icon = "sun";
}

document.getElementById("dayNightText").textContent = label;
document.querySelector("#dayNightText").previousElementSibling.setAttribute("data-lucide", icon);
    /* RAIN CARD */
    const rainIconEl = document.querySelector("#rainText").previousElementSibling;
    rainIconEl.setAttribute("data-lucide", getRainIcon());
    document.getElementById("rainText").textContent = getRainLabel();

    /* Rain Intensity label in the metric card */
    document.getElementById("rainIntensityLabel").textContent = getRainLabel();

    /* -------- MIN/MAX -------- */
    document.getElementById("tempMinMax").textContent =
        `Min: ${dailyStats.tempMin ?? "--"} / Max: ${dailyStats.tempMax ?? "--"}`;

    document.getElementById("humMinMax").textContent =
        `Min: ${dailyStats.humMin ?? "--"} / Max: ${dailyStats.humMax ?? "--"}`;

    document.getElementById("lightMinMax").textContent =
        `Min: ${dailyStats.lightMin ?? "--"} / Max: ${dailyStats.lightMax ?? "--"}`;

    /* =======================================================
       REAL WORLD PROGRESS BAR COLORS
    ======================================================= */

    /* TEMP */
    const tempBar = document.getElementById("tempBar");
    tempBar.style.width = Math.min(100, weatherData.temperature / 40 * 100) + "%";


    /* HUMIDITY */
    const humBar = document.getElementById("humidityBar");
    humBar.style.width = weatherData.humidity + "%";

    /* LIGHT */
    const lightBar = document.getElementById("lightBar");
    lightBar.style.width = Math.min(100, weatherData.light / 2000 * 100) + "%";

    /* RAIN INTENSITY */
    const rainBar = document.getElementById("rainIntensityBar");
    rainBar.style.width = weatherData.rainIntensity + "%";

    lucide.createIcons();

    
}

/* =======================================================
   PAGE SWITCHER
======================================================= */
function showPage(page) {
    const dash = document.getElementById("pageDashboard");
    const stat = document.getElementById("pageStatus");

    document.getElementById("btnDashboard").classList.remove("active");
    document.getElementById("btnStatus").classList.remove("active");

    if (page === "dashboard") {
        dash.style.display = "block";
        stat.style.display = "none";
        btnDashboard.classList.add("active");
    } else {
        dash.style.display = "none";
        stat.style.display = "block";
        btnStatus.classList.add("active");
    }

    lucide.createIcons();
}