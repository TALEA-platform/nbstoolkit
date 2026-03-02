import { useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { NBS_CATEGORIES } from '../data/filterConfig';

const COLORS = ['#21A84A', '#1272B7', '#FFE604', '#004d19', '#d69e2e', '#1a9e5c', '#0e5a92', '#b8a000', '#2d8a4e', '#0d4f80'];

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
      climateCounts[s.climate_zone] = (climateCounts[s.climate_zone] || 0) + 1;
    }
    const climateData = Object.entries(climateCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Size distribution
    const sizeCounts = {};
    for (const s of studies) {
      sizeCounts[s.size] = (sizeCounts[s.size] || 0) + 1;
    }
    const sizeData = Object.entries(sizeCounts)
      .map(([name, value]) => ({ name, value }));

    return { nbsData, countryData, climateData, sizeData };
  }, [studies]);

  if (!isOpen || !stats) return null;

  return (
    <div className="stats-panel-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={e => e.stopPropagation()}>
        <div className="stats-header">
          <h2>Statistics Dashboard</h2>
          <span className="stats-subtitle">Based on {studies.length} filtered solutions</span>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="stats-grid">
          {/* NBS Type Bar Chart */}
          <div className="stats-card">
            <h3>NBS Solutions by Category</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.nbsData} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#21A84A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Country Pie */}
          <div className="stats-card">
            <h3>Top Countries</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={stats.countryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} (${value})`}>
                  {stats.countryData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Climate Pie */}
          <div className="stats-card">
            <h3>Climate Zones</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={stats.climateData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} (${value})`}>
                  {stats.climateData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Size Pie */}
          <div className="stats-card">
            <h3>Size Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={stats.sizeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} (${value})`}>
                  {stats.sizeData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatsPanel;
