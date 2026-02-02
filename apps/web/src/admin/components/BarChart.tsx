interface BarChartProps {
  data: Array<{ category: string; count: number }>;
  width?: number;
  height?: number;
}

export function BarChart({ data, width = 600, height = 200 }: BarChartProps) {
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
  const barWidth = chartWidth / data.length;
  const barSpacing = barWidth * 0.2;
  const actualBarWidth = barWidth - barSpacing;

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

      {/* Bars */}
      {data.map((item, i) => {
        const barHeight = (item.count / maxCount) * chartHeight;
        const x = padding.left + i * barWidth + barSpacing / 2;
        const y = padding.top + chartHeight - barHeight;

        return (
          <g key={`bar-${i}`}>
            <rect
              x={x}
              y={y}
              width={actualBarWidth}
              height={barHeight}
              fill="#3b82f6"
              rx="2"
            />
            {/* Value label on top of bar */}
            <text
              x={x + actualBarWidth / 2}
              y={y - 5}
              textAnchor="middle"
              fontSize="11"
              fill="#374151"
              fontWeight="500"
            >
              {item.count}
            </text>
            {/* Category label */}
            <text
              x={x + actualBarWidth / 2}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              fontSize="11"
              fill="#6b7280"
            >
              {item.category}
            </text>
            {/* Tooltip */}
            <title>{`${item.category}: ${item.count} questions`}</title>
          </g>
        );
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
