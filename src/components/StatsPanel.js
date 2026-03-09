import { useMemo } from 'react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell, LabelList } from 'recharts';
import { NBS_CATEGORIES } from '../data/filterConfig';

// Green shades from dark to light — cohesive TALEA brand feel
function greenShade(index, total) {
  // Interpolate from rich dark green to fresh light green
  const shades = [
    '#004d19', '#0a6b2e', '#147a36', '#1a9e4a', '#21A84A',
    '#34b85c', '#4cc76e', '#66d180', '#80db94', '#99e5a8',
    '#b3efbd', '#ccf7d2', '#d9fae0', '#e6fceb', '#f0fef3',
  ];
  return shades[Math.min(index, shades.length - 1)];
}

function CustomTooltip({ active, payload, total }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload || payload[0];
  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
  return (
    <div className="stats-tooltip">
      <span className="stats-tooltip-label">{d.name}</span>
      <div className="stats-tooltip-row">
        <span className="stats-tooltip-value">{d.value}</span>
        <span className="stats-tooltip-pct">{pct}%</span>
      </div>
    </div>
  );
}

function renderValueLabel(props) {
  const { x, y, width, height, value } = props;
  if (width < 20) return null;
  return (
    <text
      x={x + width - 6}
      y={y + height / 2}
      fill="#fff"
      fontSize={11}
      fontWeight={600}
      textAnchor="end"
      dominantBaseline="central"
    >
      {value}
    </text>
  );
}

function StatCard({ title, icon, data, total, barHeight, labelWidth, full }) {
  return (
    <div className={`stats-card ${full ? 'stats-card-full' : ''}`}>
      <div className="stats-card-header">
        <span className="stats-card-icon">{icon}</span>
        <h3>{title}</h3>
        <span className="stats-card-count">{data.length} items</span>
      </div>
      <ResponsiveContainer width="100%" height={data.length * (barHeight + 6) + 16}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
          barCategoryGap="20%"
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={labelWidth}
            tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip total={total} />}
            cursor={{ fill: 'var(--bg-hover)', opacity: 0.4, radius: 4 }}
          />
          <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={barHeight} animationDuration={600}>
            {data.map((entry, i) => {
              const opacity = 1 - (i / Math.max(data.length, 1)) * 0.55;
              return (
                <Cell
                  key={i}
                  fill={greenShade(i, data.length)}
                  fillOpacity={opacity + 0.45 > 1 ? 1 : opacity + 0.45}
                />
              );
            })}
            <LabelList dataKey="value" content={renderValueLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Inline percentage breakdown */}
      <div className="stats-breakdown">
        {data.slice(0, 5).map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={i} className="stats-breakdown-item">
              <span className="stats-breakdown-dot" style={{ backgroundColor: greenShade(i, data.length) }} />
              <span className="stats-breakdown-label">{d.name}</span>
              <span className="stats-breakdown-pct">{pct}%</span>
            </div>
          );
        })}
        {data.length > 5 && (
          <span className="stats-breakdown-more">+{data.length - 5} more</span>
        )}
      </div>
    </div>
  );
}

function StatsPanel({ studies, isOpen, onClose }) {
  const stats = useMemo(() => {
    if (!studies || studies.length === 0) return null;

    // NBS type counts
    const nbsCounts = {};
    for (const [key, meta] of Object.entries(NBS_CATEGORIES)) {
      let count = 0;
      for (const s of studies) {
        count += (s[key] || []).length;
      }
      if (count > 0) {
        nbsCounts[meta.label] = count;
      }
    }
    const nbsData = Object.entries(nbsCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const nbsTotal = nbsData.reduce((s, d) => s + d.value, 0);

    // Country distribution
    const countryCounts = {};
    for (const s of studies) {
      countryCounts[s.country] = (countryCounts[s.country] || 0) + 1;
    }
    const countryData = Object.entries(countryCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Climate zone distribution
    const climateCounts = {};
    for (const s of studies) {
      if (s.climate_zone) climateCounts[s.climate_zone] = (climateCounts[s.climate_zone] || 0) + 1;
    }
    const climateData = Object.entries(climateCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Size distribution
    const sizeCounts = {};
    for (const s of studies) {
      if (s.size) sizeCounts[s.size] = (sizeCounts[s.size] || 0) + 1;
    }
    const sizeData = Object.entries(sizeCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Quick summary numbers
    const uniqueCountries = Object.keys(countryCounts).length;
    const uniqueClimates = Object.keys(climateCounts).length;
    const socialCount = studies.filter(s => s.has_social_innovation).length;
    const digitalCount = studies.filter(s => s.has_digital_innovation).length;

    return {
      nbsData, nbsTotal, countryData, climateData, sizeData,
      uniqueCountries, uniqueClimates, socialCount, digitalCount,
    };
  }, [studies]);

  if (!isOpen || !stats) return null;

  return (
    <div className="stats-panel-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={e => e.stopPropagation()}>
        <div className="stats-header">
          <div className="stats-header-left">
            <svg className="stats-header-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            <div>
              <h2>Statistics Dashboard</h2>
              <span className="stats-subtitle">Based on {studies.length} filtered solutions</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Summary row */}
        <div className="stats-summary-row">
          <div className="stats-summary-item">
            <span className="stats-summary-number">{studies.length}</span>
            <span className="stats-summary-label">Solutions</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-number">{stats.uniqueCountries}</span>
            <span className="stats-summary-label">Countries</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-number">{stats.uniqueClimates}</span>
            <span className="stats-summary-label">Climate Zones</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-number">{stats.nbsTotal}</span>
            <span className="stats-summary-label">NBS Elements</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-number">{stats.socialCount}</span>
            <span className="stats-summary-label">Social Innov.</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-number">{stats.digitalCount}</span>
            <span className="stats-summary-label">Digital Innov.</span>
          </div>
        </div>

        <div className="stats-grid">
          <StatCard
            title="NBS Solutions by Category"
            icon="🌿"
            data={stats.nbsData}
            total={stats.nbsTotal}
            barHeight={22}
            labelWidth={115}
            full
          />
          <StatCard
            title="Top Countries"
            icon="🌍"
            data={stats.countryData}
            total={studies.length}
            barHeight={20}
            labelWidth={95}
          />
          <StatCard
            title="Climate Zones"
            icon="🌤"
            data={stats.climateData}
            total={studies.length}
            barHeight={20}
            labelWidth={95}
          />
          <StatCard
            title="Size Distribution"
            icon="📐"
            data={stats.sizeData}
            total={studies.length}
            barHeight={20}
            labelWidth={95}
            full
          />
        </div>
      </div>
    </div>
  );
}

export default StatsPanel;
