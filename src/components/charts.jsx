import React, { useEffect, useMemo, useRef, useState } from 'react';

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// series: [{ key, label, color, format }], data: [{ t, ...values }]
export function AreaChart({ data = [], series, height = 240, xFormat }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 52, r: 16, t: 14, b: 28 };
  const iw = width - pad.l - pad.r; const ih = height - pad.t - pad.b;
  const max = useMemo(() => {
    const m = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
    const mag = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / mag) * mag;
  }, [data, series]);
  const x = (i) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const fmtY = series[0]?.format || ((v) => v);
  const fx = xFormat || ((t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const ticks = 4;
  const xLabels = data.length ? [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i) : [];

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - pad.l;
    const i = Math.round((px / iw) * (data.length - 1));
    setHover(i >= 0 && i < data.length ? i : null);
  };

  return (
    <div ref={ref} className="chart" style={{ height }}>
      {!data.length ? <div className="chart-empty">No data for this period</div> : (
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const v = (max / ticks) * i;
            return (
              <g key={i}>
                <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className="grid" />
                <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="axis">{fmtY(v)}</text>
              </g>
            );
          })}
          {xLabels.map((i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} className="axis">{fx(data[i].t)}</text>
          ))}
          {series.map((s) => {
            const pts = data.map((d, i) => [x(i), y(Number(d[s.key]) || 0)]);
            const line = smooth(pts);
            const area = `${line} L ${pts[pts.length - 1][0]} ${pad.t + ih} L ${pts[0][0]} ${pad.t + ih} Z`;
            return (
              <g key={s.key}>
                <path d={area} fill={`url(#g-${s.key})`} />
                <path d={line} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" />
              </g>
            );
          })}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="hover-line" />
              {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r="4.5" fill={s.color} stroke="var(--bg-1)" strokeWidth="2" />)}
            </g>
          )}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div className="chart-tip" style={{ left: Math.min(x(hover) + 12, width - 180), top: 8 }}>
          <div className="chart-tip-t">{new Date(data[hover].t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          {series.map((s) => (
            <div key={s.key} className="chart-tip-row"><i style={{ background: s.color }} />{s.label}<b>{(s.format || ((v) => v))(Number(data[hover][s.key]) || 0)}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]} ${pts[0][1]}` : '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function Sparkline({ values = [], color = 'var(--accent)', height = 36 }) {
  const [ref, width] = useWidth();
  if (values.length < 2) return <div ref={ref} style={{ height }} />;
  const max = Math.max(...values, 1); const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - min) / (max - min || 1)) * (height - 4)]);
  const line = smooth(pts);
  return (
    <div ref={ref} className="spark" style={{ height }}>
      <svg width={width} height={height}>
        <path d={`${line} L ${width} ${height} L 0 ${height} Z`} fill={color} opacity="0.12" />
        <path d={line} fill="none" stroke={color} strokeWidth="1.8" />
      </svg>
    </div>
  );
}

// items: [{ label, value, color? }]
export function BarList({ items = [], format = (v) => v, color = 'var(--accent)', empty = 'No data' }) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  if (!items.length) return <div className="chart-empty small">{empty}</div>;
  return (
    <div className="barlist">
      {items.map((it, i) => (
        <div key={i} className="barlist-row" title={`${it.label}: ${format(it.value)}`}>
          <div className="barlist-bar" style={{ width: `${(Number(it.value) / max) * 100}%`, background: it.color || color }} />
          <span className="barlist-label">{it.label}</span>
          <span className="barlist-value">{format(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

const PALETTE = ['#7c5cff', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#f87171', '#a3e635'];
export function Donut({ items = [], size = 150, format = (v) => v, centerLabel }) {
  const total = items.reduce((a, b) => a + (Number(b.value) || 0), 0);
  const r = size / 2 - 12; const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="donut">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-3)" strokeWidth="16" />
        {total > 0 && items.map((it, i) => {
          const frac = (Number(it.value) || 0) / total;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={it.color || PALETTE[i % PALETTE.length]} strokeWidth="16" strokeDasharray={`${frac * c} ${c}`} strokeDashoffset={-acc * c} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
          acc += frac; return el;
        })}
        <text x="50%" y="48%" textAnchor="middle" className="donut-total">{format(total)}</text>
        <text x="50%" y="62%" textAnchor="middle" className="donut-label">{centerLabel}</text>
      </svg>
      <div className="donut-legend">
        {items.map((it, i) => (
          <div key={i}><i style={{ background: it.color || PALETTE[i % PALETTE.length] }} /><span>{it.label}</span><b>{format(it.value)}</b></div>
        ))}
      </div>
    </div>
  );
}
