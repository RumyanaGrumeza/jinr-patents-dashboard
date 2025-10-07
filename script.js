let patents = [];
let filteredPatents = [];
let charts = {}; // Для хранения Chart.js инстансов
let ipcDescriptions = {}; // Словарь МПК из mpk_codes.csv

document.addEventListener('DOMContentLoaded', () => {
    // Загружаем mpk_codes.csv сначала
    loadMPKCsv().then(() => {
        loadCSV();
    }).catch(error => {
        console.warn('mpk_codes.csv не загружен, используем fallback:', error);
        loadCSV(); // Продолжаем без него
    });
    setupEventListeners();
});

async function loadMPKCsv() {
    try {
        const response = await fetch('mpk_codes.csv');
        if (!response.ok) throw new Error('mpk_codes.csv не найден');
        const csvText = await response.text();
        ipcDescriptions = parseMPKCsv(csvText);
        console.log(`Загружен словарь МПК: ${Object.keys(ipcDescriptions).length} кодов.`);
    } catch (error) {
        console.error('Ошибка загрузки mpk_codes.csv:', error);
        // Fallback: Пустой объект или базовый
        ipcDescriptions = {};
    }
}

function parseMPKCsv(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return {};
    const descriptions = {};

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Парсинг: Code|Subcode|Description (разделитель "|")
        const parts = line.split('|').map(p => p.trim().replace(/"/g, ''));
        if (parts.length >= 3) {
            const code = parts[0]; // Code (A, A01, A61K и т.д.)
            const description = parts[2]; // Description
            if (code && description) {
                descriptions[code] = description;
            }
        }
    }

    return descriptions;
}

async function loadCSV() {
    try {
        const response = await fetch('patents.csv');
        if (!response.ok) throw new Error('CSV не найден');
        const csvText = await response.text();
        patents = parseCSV(csvText);
        filteredPatents = [...patents];
        renderAllCharts();
        renderTable();
        console.log(`Загружено ${patents.length} патентов.`);
    } catch (error) {
        console.error('Ошибка загрузки CSV:', error);
        document.querySelectorAll('canvas, #directionsTable, #dataTable').forEach(el => {
            el.innerHTML = '<p class="text-muted">Ошибка загрузки данных. Проверьте patents.csv.</p>';
        });
    }
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return []; // Пустой CSV
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = [];
        let current = '';
        let inQuotes = false;
        for (let char of line + ',') { // Добавляем запятую в конец для парсинга
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push(current.trim().replace(/"/g, ''));
                current = '';
            } else {
                current += char;
            }
        }

        const patent = {};
        headers.forEach((header, index) => {
            patent[header] = row[index] || '';
        });

        // Парсинг года из публикации (формат ДД.ММ.ГГГГ)
        const pubDate = patent['Публикация'] || '';
        const dateMatch = pubDate.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        patent.year = dateMatch ? parseInt(dateMatch[3]) : null;

        // Авторы как массив
        patent.authorsList = (patent['Авторы'] || '').split(',').map(a => a.trim().replace(/"/g, ''));

        // Извлечение кода МПК (первые символы до пробела/не-алфанумерика, обычно 4-5: A61K)
        const mpc = patent['МПК'] || '';
        const codeMatch = mpc.match(/^[A-Z][A-Z0-9]+/); // A, A01, A61K и т.д.
        patent.ipcCode = codeMatch ? codeMatch[0] : 'Не указано';
        // Полное описание из словаря mpk_codes.csv
        patent.ipcFull = `${patent.ipcCode} - ${ipcDescriptions[patent.ipcCode] || 'Неизвестно'}`;

        data.push(patent);
    }

    return data.filter(p => p.year); // Только с годом
}

function setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            filteredPatents = patents.filter(p =>
                (p['Название'] || '').toLowerCase().includes(term) ||
                (p['Авторы'] || '').toLowerCase().includes(term)
            );
            renderAllCharts();
            renderTable();
        });
    }
}

function renderAllCharts() {
    renderYearChart();
    renderAuthorsChart();
    renderDirectionsTable();
    renderIPCChart();
}

function renderYearChart() {
    const dataByYear = {};
    filteredPatents.forEach(p => {
        const year = p.year;
        if (year) dataByYear[year] = (dataByYear[year] || 0) + 1;
    });
    const labels = Object.keys(dataByYear).sort((a, b) => parseInt(a) - parseInt(b));
    const data = labels.map(y => dataByYear[y] || 0);

    const canvas = document.getElementById('yearChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (charts.year) charts.year.destroy();
    charts.year = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Количество патентов',
                data,
                backgroundColor: '#0056b3', // Тёмно-синий оттенок
                borderColor: '#003d82',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            },
            plugins: {
                legend: { display: false } // Скрыто, заголовок в card
            }
        }
    });
}

function renderAuthorsChart() {
    const authorsCount = {};
    filteredPatents.forEach(p => {
        p.authorsList.forEach(author => {
            if (author) authorsCount[author] = (authorsCount[author] || 0) + 1;
        });
    });
    const topAuthors = Object.entries(authorsCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    const labels = topAuthors.map(([author]) => author);
    const data = topAuthors.map(([, count]) => count);

    const canvas = document.getElementById('authorsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (charts.authors) charts.authors.destroy();
    charts.authors = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Количество патентов', // Изменено
                data,
                backgroundColor: '#0056b3', // Синий оттенок
                borderColor: '#003d82',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', // Горизонтальный бар
            responsive: true,
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1 } }
            },
            plugins: {
                legend: { display: true, position: 'top' }
            }
        }
    });
}

// Таблица для направлений (полные названия, без обрезки)
function renderDirectionsTable() {
    const directionsCount = {};
    filteredPatents.forEach(p => {
        const dir = (p['Направление'] || 'Не указано').trim();
        if (dir) directionsCount[dir] = (directionsCount[dir] || 0) + 1;
    });
    const topDirections = Object.entries(directionsCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

    const tableDiv = document.getElementById('directionsTable');
    if (!tableDiv) return;
    if (topDirections.length === 0) {
        tableDiv.innerHTML = '<p class="text-muted">Нет данных для отображения.</p>';
        return;
    }

    let html = `
        <table class="table table-striped table-sm">
            <thead class="table-light">
                <tr>
                    <th>Направление</th>
                    <th>Кол-во патентов</th>
                </tr>
            </thead>
            <tbody>
    `;
    topDirections.forEach(([dir, count]) => {
        // Убрана обрезка: Полное название
        html += `
            <tr>
                <td>${dir}</td>
                <td>${count}</td>
            </tr>
        `;
    });
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
}

function renderIPCChart() {
    const ipcCount = {};
    filteredPatents.forEach(p => {
        const ipc = p.ipcCode || 'Не указано'; // Группировка по извлечённому коду
        ipcCount[ipc] = (ipcCount[ipc] || 0) + 1;
    });

    // Сортировка по алфавиту (по коду)
    const sortedKeys = Object.keys(ipcCount).sort();
    // Labels: "Код - Описание" из mpk_codes.csv (уникально по коду)
    const labels = sortedKeys.map(key => ipcDescriptions[key] ? `${key} - ${ipcDescriptions[key]}` : `${key} - Неизвестно`);
    const data = sortedKeys.map(key => ipcCount[key]);

    // Расширенная палитра: 20 уникальных, ярких и различимых цветов (без повторений для типичных данных)
    const colors = [
        '#FF6384', // Розовый
        '#36A2EB', // Синий
        '#FFCE56', // Светло-жёлтый
        '#4BC0C0', // Бирюзовый
        '#9966FF', // Фиолетовый
        '#FF9F40', // Оранжевый
        '#FF6384', // Розовый (но для >6 уникальные ниже)
        '#C9CBCF', // Светло-серый
        '#E7E9ED', // Очень светлый серый
        '#4BC0C0', // Бирюзовый (дубликат только если >10)
        '#FF6384', // Повтор только для редких случаев
        '#36A2EB', // Синий
        '#FFCE56', // Жёлтый
        '#FF9F40', // Оранжевый
        '#9966FF', // Фиолетовый
        '#4BC0C0', // Бирюзовый
        '#FF6384', // Розовый
        '#C9CBCF', // Серый
        '#FF6384', // Дополнительный
        '#36A2EB'  // Закольцовка, но для 20+ Chart.js авто
    ];
    const backgroundColors = sortedKeys.map((_, index) => colors[index % colors.length]); // % для >20

    // Лог для отладки
    console.log(`МПК коды: ${sortedKeys.length} уникальных, цвета из палитры ${colors.length}`);

    const canvas = document.getElementById('ipcChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (charts.ipc) charts.ipc.destroy();
    charts.ipc = new Chart(ctx, {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                label: 'Распределение по МПК',
                data,
                backgroundColor: backgroundColors,
                borderWidth: 1,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom', // Легенда внизу
                    labels: {
                        usePointStyle: true, // Точки вместо линий
                        padding: 10, // Меньше отступы
                        font: { size: 10 }, // Меньший шрифт для компактности
                        generateLabels: function(chart) {
                            // Кастом: Обрезаем длинные labels для легенды (если >50 символов)
                            return chart.data.labels.map((label, i) => ({
                                text: label.length > 50 ? label.substring(0, 50) + '...' : label,
                                fillStyle: chart.data.datasets[0].backgroundColor[i],
                                strokeStyle: chart.data.datasets[0].borderColor[i],
                                lineWidth: chart.data.datasets[0].borderWidth,
                                pointStyle: 'circle',
                                index: i
                            }));
                        }
                    }
                }
            }
        }
    });
}

// Таблица сырых данных
function renderTable() {
    const tableDiv = document.getElementById('dataTable');
    if (!tableDiv) return;
    if (filteredPatents.length === 0) {
        tableDiv.innerHTML = '<p class="text-muted">Нет данных. Попробуйте изменить поиск.</p>';
        return;
    }

    let html = `
        <table class="table table-striped table-sm">
            <thead class="table-light">
                <tr>
                    <th>Патент</th>
                    <th>Название</th>
                    <th>Авторы</th>
                    <th>Год</th>
                    <th>МПК</th>
                </tr>
            </thead>
            <tbody>
    `;
    filteredPatents.slice(0, 50).forEach(p => { // Лимит 50 для производительности
        const patentLink = p['Номер'] ? `<a href="https://patents.google.com/patent/${p['Номер']}" target="_blank">${p['Номер']}</a>` : 'N/A';
        html += `
            <tr>
                <td>${patentLink}</td>
                <td>${(p['Название'] || '').substring(0, 50)}${(p['Название'] || '').length > 50 ? '...' : ''}</td>
                <td>${p['Авторы'] || ''}</td>
                <td>${p.year || ''}</td>
                <td>${p.ipcFull || ''}</td>
            </tr>
        `;
    });
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
}