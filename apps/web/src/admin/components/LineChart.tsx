interface LineChartProps {
  data: Array<{ date: string; count: number }>;
  width?: number;
  height?: number;
}

export function LineChart({ data, width = 600, height = 200 }: LineChartProps) {
  if (data.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6b7280',
          fontSize: '0.875rem',
        }}
      >
        No data available
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxCount = Math.max(...data.map(d => d.count), 1);
  const minCount = 0;

  // Calculate points
  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.count - minCount) / (maxCount - minCount || 1)) * chartHeight;
    return { x, y, count: d.count, date: d.date };
  });

  // Create path for line
  const pathData = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Grid lines */}
      {[0, 1, 2, 3, 4].map(i => {
        const y = padding.top + (i / 4) * chartHeight;
        return (
          <line
            key={`grid-${i}`}
            x1={padding.left}
            y1={y}
            x2={width - padding.right}
            y2={y}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        );
      })}

      {/* Y-axis labels */}
      {[0, 1, 2, 3, 4].map(i => {
        const value = Math.round(maxCount * (1 - i / 4));
        const y = padding.top + (i / 4) * chartHeight;
        return (
          <text
            key={`y-label-${i}`}
            x={padding.left - 10}
            y={y + 4}
            textAnchor="end"
            fontSize="12"
            fill="#6b7280"
          >
            {value}
          </text>
        );
      })}

      {/* Line */}
      <path
        d={pathData}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Points */}
      {points.map((point, i) => (
        <g key={`point-${i}`}>
          <circle
            cx={point.x}
            cy={point.y}
            r="4"
            fill="#3b82f6"
            stroke="#ffffff"
            strokeWidth="2"
          />
          {/* Tooltip on hover */}
          <title>{`${point.date}: ${point.count} questions`}</title>
        </g>
      ))}

      {/* X-axis labels */}
      {points.map((point, i) => {
        // Show every other label to avoid crowding
        if (i % 2 === 0 || i === points.length - 1) {
          return (
            <text
              key={`x-label-${i}`}
              x={point.x}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              fontSize="11"
              fill="#6b7280"
            >
              {point.date}
            </text>
          );
        }
        return null;
      })}

      {/* X-axis line */}
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="#374151"
        strokeWidth="1"
      />

      {/* Y-axis line */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke="#374151"
        strokeWidth="1"
      />
    </svg>
  );
}
