let patents = [];
let filteredPatents = [];
let charts = {};
let ipcDescriptions = {}; // Словарь для хранения описаний МПК

let searchTerm = ''; // Для поиска по тексту
let selectedIpcCodes = new Set(); // Выбранные коды МПК
let selectedYears = new Set(); // Выбранные годы

document.addEventListener('DOMContentLoaded', () => {
    // Сначала загружаем mpk_codes.csv, затем patents.csv
    loadMPKCsv().then(() => {
        loadCSV();
    }).catch(error => {
        console.warn('mpk_codes.csv не загружен, используем коды без описаний:', error);
        loadCSV();
    });
    setupEventListeners();
});

// Функция для загрузки и парсинга mpk_codes.csv
async function loadMPKCsv() {
    try {
        const response = await fetch('mpk_codes.csv');
        if (!response.ok) throw new Error('mpk_codes.csv не найден');
        const csvText = await response.text();
        ipcDescriptions = parseMPKCsv(csvText);
        console.log(`Загружен словарь МПК: ${Object.keys(ipcDescriptions).length} кодов.`);
    } catch (error) {
        console.error('Ошибка загрузки mpk_codes.csv:', error);
        ipcDescriptions = {};
    }
}

// Функция для парсинга mpk_codes.csv
function parseMPKCsv(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return {};
    const descriptions = {};

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Парсинг строки: Code|Subcode|Description
        const parts = line.split('|').map(p => p.trim().replace(/"/g, ''));
        if (parts.length >= 3) {
            const code = parts[0]; // Code (A, B01, G21 и т.д.)
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
        const csvText = await response.text();
        patents = parseCSV(csvText);
        filteredPatents = [...patents];
        // После загрузки данных: заполняем фильтры и применяем (все по умолчанию)
        populateFilters();
        initializeFilters();
        applyFilters();

        console.log(`Загружено ${patents.length} патентов.`);
    } catch (error) {
        console.error('Ошибка загрузки CSV:', error);
        alert('Ошибка загрузки patents.csv. Проверьте файл.');
    }
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = [];
        let current = '';
        let inQuotes = false;
        for (let char of line + ',') {
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

        // Парсим даты для года (из "Публикация")
        const pubDate = patent['Публикация'] || '';
        const dateMatch = pubDate.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        patent.year = dateMatch ? parseInt(dateMatch[3]) : null;

        // Авторы: разбиваем по запятым
        patent.authorsList = (patent['Авторы'] || '').split(',').map(a => a.trim().replace(/"/g, ''));

        // МПК: извлекаем основной код (первые 3-4 символа до пробела)
        const mpc = patent['МПК'] || '';
        const codeMatch = mpc.match(/^[A-Z][A-Z0-9]+/); // A, B01, G21K и т.д.
        patent.ipcCode = codeMatch ? codeMatch[0] : 'Не указано';

        // Получаем описание из словаря
        patent.ipcDescription = ipcDescriptions[patent.ipcCode] || 'Неизвестно';

        data.push(patent);
    }

    return data.filter(p => p.year);
}

// Функция для генерации чекбоксов в фильтрах
function populateFilters() {
    // Уникальные коды МПК (сортировка)
    const uniqueIpcs = [...new Set(patents.map(p => p.ipcCode))].filter(code => code !== 'Не указано').sort();
    let ipcHtml = '';
    uniqueIpcs.forEach(code => {
        const desc = ipcDescriptions[code] || 'Неизвестно';
        const shortDesc = desc.length > 50 ? desc.substring(0, 50) + '...' : desc;
        ipcHtml += `
            <div class="form-check">
                <input class="form-check-input ipc-checkbox" type="checkbox" id="ipc-${code}" data-value="${code}">
                <label class="form-check-label" for="ipc-${code}">${code} - ${shortDesc}</label>
            </div>
        `;
    });
    document.getElementById('ipcFilter').innerHTML = ipcHtml || '<p class="text-muted">Нет данных для фильтра.</p>';

    // Уникальные годы (сортировка по возрастанию)
    const uniqueYears = [...new Set(patents.map(p => p.year))].filter(year => year !== null).sort((a, b) => a - b);
    let yearHtml = '';
    uniqueYears.forEach(year => {
        yearHtml += `
            <div class="form-check">
                <input class="form-check-input year-checkbox" type="checkbox" id="year-${year}" data-value="${year}">
                <label class="form-check-label" for="year-${year}">Год ${year}</label>
            </div>
        `;
    });
    document.getElementById('yearFilter').innerHTML = yearHtml || '<p class="text-muted">Нет данных для фильтра.</p>';
}

// Инициализация фильтров: По умолчанию НИЧЕГО не выбрано
function initializeFilters() {
    // Очищаем выбранные значения
    selectedIpcCodes.clear();
    selectedYears.clear();

    // Снимаем все галочки
    const allCheckboxes = document.querySelectorAll('.ipc-checkbox, .year-checkbox');
    allCheckboxes.forEach(cb => cb.checked = false);

    // Применяем фильтры (покажет все данные, так как фильтры пустые)
    applyFilters();
}

// Применение всех фильтров
function applyFilters() {
    let temp = patents.filter(p => {
        // Фильтр по поиску
        if (searchTerm) {
            const title = (p['Название'] || '').toLowerCase();
            const authors = (p['Авторы'] || '').toLowerCase();
            return title.includes(searchTerm) || authors.includes(searchTerm);
        }
        return true;
    });

    // Фильтр по МПК: если выбраны какие-то коды - фильтруем, иначе показываем все
    if (selectedIpcCodes.size > 0) {
        temp = temp.filter(p => selectedIpcCodes.has(p.ipcCode));
    }

    // Фильтр по году: если выбраны какие-то годы - фильтруем, иначе показываем все
    if (selectedYears.size > 0) {
        temp = temp.filter(p => selectedYears.has(p.year));
    }

    filteredPatents = temp;
    renderAllCharts();
    renderTable();
}

function setupEventListeners() {
    // Поиск по тексту
    document.getElementById('search-input').addEventListener('input', (e) => {
        searchTerm = e.target.value.toLowerCase();
        applyFilters();
    });

    // Фильтр по МПК: Delegation на изменения чекбоксов
    document.getElementById('ipcFilter').addEventListener('change', (e) => {
        if (e.target.classList.contains('ipc-checkbox')) {
            const value = e.target.dataset.value;
            if (e.target.checked) {
                selectedIpcCodes.add(value);
            } else {
                selectedIpcCodes.delete(value);
            }
            applyFilters();
        }
    });

    // Кнопка очистки МПК
    document.getElementById('clearIpc').addEventListener('click', () => {
        selectedIpcCodes.clear();
        const checkboxes = document.querySelectorAll('.ipc-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
        applyFilters();
    });

    // Фильтр по году: Delegation на изменения чекбоксов
    document.getElementById('yearFilter').addEventListener('change', (e) => {
        if (e.target.classList.contains('year-checkbox')) {
            const value = parseInt(e.target.dataset.value);
            if (e.target.checked) {
                selectedYears.add(value);
            } else {
                selectedYears.delete(value);
            }
            applyFilters();
        }
    });

    // Кнопка очистки года
    document.getElementById('clearYear').addEventListener('click', () => {
        selectedYears.clear();
        const checkboxes = document.querySelectorAll('.year-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
        applyFilters();
    });
}

function renderAllCharts() {
    renderYearChart();
    renderAuthorsChart();
    renderDirectionsTable(); // Новая таблица вместо графика
    renderIPCChart();
}

function renderYearChart() {
    const dataByYear = {};
    filteredPatents.forEach(p => {
        const year = p.year;
        dataByYear[year] = (dataByYear[year] || 0) + 1;
    });
    const labels = Object.keys(dataByYear).sort((a, b) => a - b);
    const data = labels.map(y => dataByYear[y]);

    const ctx = document.getElementById('yearChart').getContext('2d');
    if (charts.year) charts.year.destroy();
    charts.year = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Количество патентов', data, backgroundColor: '#0056b3' }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: {
                legend: { display: true }
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

    const ctx = document.getElementById('authorsChart').getContext('2d');
    if (charts.authors) charts.authors.destroy();
    charts.authors = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Количество патентов', data, backgroundColor: '#0056b3' }] },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { beginAtZero: true } },
            plugins: {
                legend: { display: true }
            }
        }
    });
}

function renderDirectionsTable() {
    const directionsCount = {};
    filteredPatents.forEach(p => {
        const dir = p['Направление'] || 'Не указано';
        directionsCount[dir] = (directionsCount[dir] || 0) + 1;
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
                    <th>Название направления</th>
                    <th>Количество патентов</th>
                </tr>
            </thead>
            <tbody>
    `;

    topDirections.forEach(([dir, count]) => {
        html += `
            <tr>
                <td>${escapeHtml(dir)}</td> <!-- Полное название, без обрезки -->
                <td>${count}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    tableDiv.innerHTML = html;
}

function renderIPCChart() {
    const ipcCount = {};
    filteredPatents.forEach(p => {
        const ipc = p.ipcCode || 'Не указано';
        ipcCount[ipc] = (ipcCount[ipc] || 0) + 1;
    });

    const sortedKeys = Object.keys(ipcCount).sort();

    // Создаем labels с кодами и описаниями
    const labels = sortedKeys.map(key => {
        const description = ipcDescriptions[key] || 'Неизвестно';
        return `${key} - ${description}`;
    });

    const data = sortedKeys.map(key => ipcCount[key]);

    const ctx = document.getElementById('ipcChart').getContext('2d');
    if (charts.ipc) charts.ipc.destroy();

    charts.ipc = new Chart(ctx, {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: [
                    '#dc3545', '#007bff', '#28a745', '#ffc107',
                    '#6f42c1', '#fd7e14', '#20c997', '#e83e8c',
                    '#6610f2', '#6f42c1', '#d63384', '#fd7e14',
                    '#198754', '#0dcaf0', '#ffc107', '#0d6efd'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 20,
                        padding: 15,
                        usePointStyle: false,
                        font: {
                            size: 11,
                            family: "'Roboto', sans-serif"
                        },
                        // Кастомная функция для полного отображения текста
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);

                                    return {
                                        text: label, // Полный текст с кодом и описанием
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: style.borderColor,
                                        lineWidth: style.borderWidth,
                                        pointStyle: style.pointStyle,
                                        hidden: !chart.getDataVisibility(i),
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderTable() {
    const tableDiv = document.getElementById('dataTable');
    if (filteredPatents.length === 0) {
        tableDiv.innerHTML = '<p class="text-muted">Нет результатов поиска.</p>';
        return;
    }

    let html = '<table class="table table-striped"><thead><tr><th>№</th><th>Название</th><th>Авторы</th><th>МПК</th><th>Направление</th><th>Год публикации</th><th>Номер</th><th>Ссылка</th></tr></thead><tbody>';
    filteredPatents.forEach(p => {
        const title = escapeHtml(p['Название'] || ''); // Полное название, без обрезки
        const authors = escapeHtml(p['Авторы'] || ''); // Полные авторы, без обрезки
        const linkUrl = escapeHtml(p['Ссылка на патент'] || '#');
        const linkText = linkUrl !== '#' ? 'Открыть' : 'N/A';

        html += `<tr>
            <td>${escapeHtml(p['№'] || '')}</td>
            <td>${title}</td> <!-- Полное название -->
            <td>${authors}</td> <!-- Полные авторы -->
            <td>${escapeHtml(p['МПК'] || '')}</td>
            <td>${escapeHtml(p['Направление'] || '')}</td>
            <td>${p.year || ''}</td>
            <td>${escapeHtml(p['Номер патента'] || '')}</td>
            <td><a href="${linkUrl}" target="_blank">${linkText}</a></td>
        </tr>`;
    });
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
}

// Простая функция для экранирования HTML (безопасность)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}