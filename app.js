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
const toolbar = document.querySelector('.toolbar');
const dataNote = document.querySelector('#data-note');
const refreshLabel = refresh.querySelector('.refresh-label');
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
  const width = Math.max(240, canvas.getBoundingClientRect().width || 600);
  const height = 135;
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.strokeStyle = '#263844';
  ctx.setLineDash([3, 5]);
  for (const y of [6, height / 2, height - 6]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = '#8ce8c4';
  ctx.fillStyle = '#8ce8c4';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let previous = -Infinity;
  let x, y;
  let segment = [];
  const segments = [];
  for (const { time, value } of samples) {
    x = 4 + (time - start) / (end - start) * (width - 8);
    y = height - 6 - (value / max) * (height - 12);
    if (time - previous > period * 1.5) {
      ctx.moveTo(x, y);
      segment = [];
      segments.push(segment);
    } else ctx.lineTo(x, y);
    segment.push([x, y]);
    previous = time;
  }
  ctx.stroke();
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, '#8ce8c42b');
  fill.addColorStop(1, '#8ce8c400');
  ctx.fillStyle = fill;
  for (const points of segments) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], height - 6);
    for (const point of points) ctx.lineTo(...point);
    ctx.lineTo(points.at(-1)[0], height - 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#8ce8c4';
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, 2 * Math.PI);
  ctx.fill();
}

function render() {
  if (!snapshot) return;
  const end = Date.parse(snapshot.updatedAt);
  const start = end - Number(select.value) * 3600000;
  const period = snapshot.periodSeconds * 1000;
  const charts = [];
  const cards = definitions.map(({ id, name, unit }, index) => {
    const format = value => `${number.format(value)} ${unit}`;
    const series = snapshot.metrics[id];
    const samples = (Array.isArray(series) ? series : [])
      .filter(sample => sample && Number.isFinite(sample.value) && sample.value >= 0
        && (unit !== '%' || sample.value <= 100))
      .map(({ timestamp: date, value }) => ({ time: Date.parse(date), value }))
      .filter(({ time }) => time >= start && time <= end)
      .sort((a, b) => a.time - b.time);
    const card = template.content.firstElementChild.cloneNode(true);
    card.style.setProperty('--delay', `${index * 45}ms`);
    card.querySelector('.metric-index').textContent = ['CPU', 'RAM', 'DISK', 'IN', 'OUT'][index];
    card.querySelector('.table-scroll').setAttribute('aria-label', `Amostras: ${name}`);
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
      const empty = document.createElement('div');
      empty.className = 'empty-chart';
      empty.textContent = 'Aguardando amostras desta métrica';
      card.append(empty);
      return card;
    }
    const latest = samples.at(-1);
    const mean = samples.reduce((total, sample) => total + sample.value, 0) / samples.length;
    const max = samples.reduce((highest, sample) => Math.max(highest, sample.value), 0);
    value.textContent = format(latest.value);
    summary.textContent = `Média ${format(mean)} · Pico ${format(max)} · ${samples.length} amostras`;
    charts.push(() => draw(canvas, samples, start, end, period, unit === '%' ? 100 : Math.max(max, 0.01)));
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
  redrawCharts = () => charts.forEach(drawChart => drawChart());
  redrawCharts();
}

async function load() {
  if (refresh.disabled) return;
  refresh.disabled = true;
  refreshLabel.textContent = 'Atualizando…';
  grid.setAttribute('aria-busy', 'true');
  status.textContent = 'Buscando as métricas mais recentes…';
  try {
    const response = await fetch('./metrics.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (response.status === 404 && (!snapshot || snapshot.source === 'demo')) snapshot = demo();
    else {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      snapshot = parseSnapshot(await response.json());
    }
    source.textContent = snapshot.source === 'demo' ? 'Dados simulados' : 'Amazon CloudWatch';
    toolbar.dataset.state = snapshot.source;
    dataNote.classList.toggle('is-demo', snapshot.source === 'demo');
    dataNote.textContent = snapshot.source === 'demo'
      ? 'Modo demonstração · Os valores são simulados e não representam uma instância real.'
      : 'Dados coletados do CloudWatch · Horários no fuso do navegador. Métricas sem amostras aparecem como indisponíveis.';
    status.textContent = `Dados até ${timestamp.format(Date.parse(snapshot.updatedAt))} · Intervalo de ${snapshot.periodSeconds} s`;
    render();
  } catch {
    toolbar.dataset.state = 'error';
    if (!snapshot) {
      source.textContent = 'Métricas indisponíveis';
      status.textContent = 'Falha ao carregar os dados. Tente atualizar.';
      dataNote.textContent = 'Não foi possível consultar as métricas. Use Atualizar dados para tentar novamente.';
    } else {
      status.textContent = `Falha na atualização · Exibindo dados até ${timestamp.format(Date.parse(snapshot.updatedAt))}`;
    }
  } finally {
    refresh.disabled = false;
    refreshLabel.textContent = 'Atualizar dados';
    grid.setAttribute('aria-busy', 'false');
  }
}

let redrawCharts = () => {};
let resizeFrame;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => redrawCharts());
}).observe(grid);
select.addEventListener('change', () => {
  render();
  if (snapshot) status.textContent = `Dados até ${timestamp.format(Date.parse(snapshot.updatedAt))} · ${select.selectedOptions[0].textContent} · Intervalo de ${snapshot.periodSeconds} s`;
});
refresh.addEventListener('click', load);
load();
