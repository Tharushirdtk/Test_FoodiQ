import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';

Chart.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, TimeScale);

function toLocalDateOnly(dt) {
  const d = new Date(dt);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function buildSteps(xMin, xMax, sampling) {
  if (!xMin || !xMax) return null;
  const steps = [];
  const start = toLocalDateOnly(xMin);
  const end = toLocalDateOnly(xMax);
  if (!start || !end || start > end) return null;

  if (sampling === 'daily') {
    let cur = new Date(start);
    while (cur <= end) {
      steps.push(new Date(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
  } else if (sampling === 'weekly') {
    let cur = new Date(start);
    while (cur <= end) {
      steps.push(new Date(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
    }
  } else if (sampling === 'monthly') {
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      steps.push(new Date(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  } else if (sampling === 'yearly') {
    let cur = new Date(start.getFullYear(), 0, 1);
    while (cur <= end) {
      steps.push(new Date(cur));
      cur = new Date(cur.getFullYear() + 1, 0, 1);
    }
  }
  return steps;
}

function resampleSeries(series, labelKey, valueKey, xMin, xMax, sampling) {
  if (!series || series.length === 0) return [];
  // if xMin/xMax not provided, return original series formatted (normalized to local date-only)
  if (!xMin || !xMax) {
    return series.map((s) => ({ x: toLocalDateOnly(s[labelKey] || s.date || s.label), y: s[valueKey] ?? null }));
  }

  const steps = buildSteps(xMin, xMax, sampling) || [];
  if (steps.length === 0) return [];

  // Build a lookup of exact-period points so we only show points that were returned by the API.
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  const asDateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const periodKey = (dt, samp) => {
    // if original value is a plain YYYY-MM or YYYY string, return quickly
    if (typeof dt === 'string') {
      // daily 'YYYY-MM-DD'
      const mDaily = dt.match(/^(\d{4}-\d{2}-\d{2})/);
      if (mDaily) return mDaily[1];
      const mMonthly = dt.match(/^(\d{4}-\d{2})/);
      if (mMonthly) return mMonthly[1];
      const mYear = dt.match(/^(\d{4})/);
      if (mYear) return mYear[1];
    }
    const d = new Date(dt);
    if (isNaN(d)) return null;
    if (samp === 'daily') return asDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (samp === 'monthly') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    if (samp === 'yearly') return `${d.getFullYear()}`;
    // weekly -> normalize to Monday (local) of that week using local getDay()
    const day = d.getDay();
    const diff = (day + 6) % 7; // days since Monday
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
    return asDateKey(monday.getFullYear(), monday.getMonth() + 1, monday.getDate());
  };

  const map = {};
  for (const s of series) {
    const raw = s[labelKey] || s.date || s.label;
    // prefer string keys (API often returns 'YYYY-MM-DD')
    let key = null;
    if (typeof raw === 'string') {
      key = periodKey(raw, sampling);
    }
    if (!key) {
      const d = new Date(raw);
      if (isNaN(d)) continue;
      key = periodKey(d, sampling);
    }
    if (!key) continue;
    map[key] = typeof s[valueKey] !== 'undefined' && s[valueKey] !== null ? s[valueKey] : null;
  }

  const out = steps.map((step) => {
    const key = periodKey(step, sampling);
    // create local-midnight Date for the x value
    const x = new Date(step.getFullYear(), step.getMonth(), step.getDate());
    return { x, y: map.hasOwnProperty(key) ? map[key] : null };
  });

  return out;
}

export default function TimeSeriesChart({ series = [], labelKey = 'period', valueKey = 'value', title = '', color = '#1976d2', options = {}, sampling = 'monthly', range = null, xMin = null, xMax = null }) {
  const samplingUsed = sampling || range || 'monthly';
  const resampled = useMemo(() => resampleSeries(series, labelKey, valueKey, xMin, xMax, samplingUsed), [series, labelKey, valueKey, xMin, xMax, samplingUsed]);

  const labels = resampled.map((p) => p.x);
  const data = resampled.map((p) => (p.y == null ? null : p.y));

  const chartData = {
    labels,
    datasets: [
      {
        label: title || 'Series',
        data,
        fill: true,
        borderColor: color,
        backgroundColor: `${color}33`,
        tension: 0.2,
        pointRadius: 3,
        pointHoverRadius: 5,
        spanGaps: true,
      },
    ],
  };

  const unitMap = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
  const timeUnit = unitMap[samplingUsed] || 'month';

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
        tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
          titleColor: 'var(--text-on-primary, #fff)',
          bodyColor: 'var(--text-on-primary, #fff)',
        borderColor: color,
        borderWidth: 1,
        callbacks: {
          title: (items) => {
            if (!items || items.length === 0) return '';
            const raw = items[0].parsed && items[0].parsed.x ? items[0].parsed.x : items[0].label;
            const d = raw ? new Date(raw) : null;
            if (!d || isNaN(d)) return '';
            const y = d.getFullYear();
            const m = `${d.getMonth() + 1}`.padStart(2, '0');
            const day = `${d.getDate()}`.padStart(2, '0');
            return `${y}-${m}-${day}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: timeUnit, displayFormats: { day: 'yyyy-MM-dd', month: 'yyyy-MM', year: 'yyyy' } },
        min: xMin || undefined,
        max: xMax || undefined,
        ticks: {
          maxRotation: 0,
          color: 'var(--text-gray, #666)',
          font: {
            size: 11,
          },
        },
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: 'var(--text-gray, #666)',
          font: {
            size: 11,
          },
        },
        grid: {
          color: 'var(--grid-color, rgba(0, 0, 0, 0.05))',
        },
      },
    },
    layout: {
      padding: {
        top: 10,
        right: 10,
        bottom: 10,
        left: 10,
      },
    },
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Line data={chartData} options={{ ...defaultOptions, ...options }} />
    </div>
  );
}