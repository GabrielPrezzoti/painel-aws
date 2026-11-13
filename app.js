const definitions = [
  { id: 'cpu', name: 'Utilização de CPU', unit: '%' },
  { id: 'memory', name: 'Utilização de memória', unit: '%' },
  { id: 'disk', name: 'Ocupação do disco', unit: '%' },
  { id: 'networkIn', name: 'Tráfego de entrada', unit: 'MiB' },
  { id: 'networkOut', name: 'Tráfego de saída', unit: 'MiB' },
];
const select = document.querySelector('#window');
const refresh = document.querySelector('#refresh');
const source = document.querySelector('#source');
const status = document.querySelector('#status');
const grid = document.querySelector('#metrics');
const template = document.querySelector('#metric');
const timestamp = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
let snapshot;

function demo() {
  const periodSeconds = 300;
  const step = periodSeconds * 1000;
  const end = Math.floor(Date.now() / step) * step - step;
  const baselines = [24, 46, 38, 3, 7];
  const amplitudes = [19, 6, 0.3, 2.5, 5];
  const metrics = Object.fromEntries(definitions.map(({ id }, index) => [
    id, Array.from({ length: 289 }, (_, i) => {
      const time = end - (288 - i) * step;
      const interval = time / step;
      const variation = (Math.sin(interval / 11) + Math.sin(interval / 2.7) * 0.35) / 1.35;
      const value = baselines[index] + amplitudes[index] * variation;
      return { timestamp: new Date(time).toISOString(), value };
    }),
  ]));
  return { source: 'demo', updatedAt: new Date(end).toISOString(), periodSeconds, metrics };
}

function parseSnapshot(data) {
  if (!data || data.source !== 'cloudwatch' || !Number.isFinite(Date.parse(data.updatedAt))
      || !Number.isInteger(data.periodSeconds) || data.periodSeconds < 1
      || !data.metrics || typeof data.metrics !== 'object' || Array.isArray(data.metrics)) {
    throw new Error('Formato de métricas inválido.');
  }
  return data;
}

function draw(canvas, samples, start, end, period, max) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.strokeStyle = '#34435a';
  for (const y of [6, height / 2, height - 6]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#72e7be';
  ctx.fillStyle = '#72e7be';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let previous = -Infinity;
  let x, y;
  for (const { time, value } of samples) {
    x = 4 + (time - start) / (end - start) * (width - 8);
    y = height - 6 - (value / max) * (height - 12);
    if (time - previous > period * 1.5) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    previous = time;
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, 2 * Math.PI);
  ctx.fill();
}

function render() {
  if (!snapshot) return;
  const end = Date.parse(snapshot.updatedAt);
  const start = end - Number(select.value) * 3600000;
  const period = snapshot.periodSeconds * 1000;
  const cards = definitions.map(({ id, name, unit }) => {
    const format = value => `${number.format(value)} ${unit}`;
    const series = snapshot.metrics[id];
    const samples = (Array.isArray(series) ? series : [])
      .filter(sample => sample && Number.isFinite(sample.value) && sample.value >= 0
        && (unit !== '%' || sample.value <= 100))
      .map(({ timestamp: date, value }) => ({ time: Date.parse(date), value }))
      .filter(({ time }) => time >= start && time <= end)
      .sort((a, b) => a.time - b.time);
    const card = template.content.firstElementChild.cloneNode(true);
    card.querySelector('h2').textContent = name;
    const value = card.querySelector('.value');
    const summary = card.querySelector('.summary');
    const canvas = card.querySelector('canvas');
    if (!samples.length) {
      value.textContent = '—';
      summary.textContent = 'Sem dados no período';
      canvas.remove();
      card.querySelector('.axis').remove();
      card.querySelector('details').remove();
      return card;
    }
    const latest = samples.at(-1);
    const mean = samples.reduce((total, sample) => total + sample.value, 0) / samples.length;
    const max = samples.reduce((highest, sample) => Math.max(highest, sample.value), 0);
    value.textContent = format(latest.value);
    summary.textContent = `Média ${format(mean)} · Pico ${format(max)} · ${samples.length} amostras`;
    draw(canvas, samples, start, end, period, unit === '%' ? 100 : Math.max(max, 0.01));
    const [from, to] = card.querySelectorAll('.axis span');
    from.textContent = timestamp.format(start);
    to.textContent = timestamp.format(end);
    const rows = samples.slice().reverse().map(({ time, value }) => {
      const row = document.createElement('tr');
      row.insertCell().textContent = timestamp.format(time);
      row.insertCell().textContent = format(value);
      return row;
    });
    card.querySelector('tbody').replaceChildren(...rows);
    return card;
  });
  grid.replaceChildren(...cards);
}

async function load() {
  refresh.disabled = true;
  try {
    const response = await fetch('./metrics.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (response.status === 404 && (!snapshot || snapshot.source === 'demo')) snapshot = demo();
    else {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      snapshot = parseSnapshot(await response.json());
    }
    source.textContent = snapshot.source === 'demo' ? 'Dados simulados' : 'Amazon CloudWatch';
    status.textContent = `Dados até ${timestamp.format(Date.parse(snapshot.updatedAt))} · Intervalo de ${snapshot.periodSeconds} s`;
    render();
  } catch {
    if (!snapshot) {
      source.textContent = 'Métricas indisponíveis';
      status.textContent = 'Falha ao carregar os dados. Tente atualizar.';
    } else {
      status.textContent = `Falha na atualização · Exibindo dados até ${timestamp.format(Date.parse(snapshot.updatedAt))}`;
    }
  } finally {
    refresh.disabled = false;
  }
}

select.addEventListener('change', render);
refresh.addEventListener('click', load);
load();
