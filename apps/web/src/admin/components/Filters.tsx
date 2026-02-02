import type { FilterState, DateRange } from '../utils/analytics';

interface FiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  categories: string[];
}

export function Filters({ filters, onFiltersChange, categories }: FiltersProps) {
  const handleDateRangeChange = (range: DateRange) => {
    onFiltersChange({ ...filters, dateRange: range });
  };

  const handleCategoryChange = (category: string) => {
    onFiltersChange({ ...filters, category });
  };

  const handleSearchChange = (query: string) => {
    onFiltersChange({ ...filters, searchQuery: query });
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        marginBottom: '1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
      }}
    >
      {/* Date Range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label
          style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#374151',
            whiteSpace: 'nowrap',
          }}
        >
          Date Range:
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['24h', '7d', '30d'] as DateRange[]).map((range) => (
            <button
              key={range}
              onClick={() => handleDateRangeChange(range)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: filters.dateRange === range ? '#3b82f6' : '#f3f4f6',
                color: filters.dateRange === range ? 'white' : '#374151',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                if (filters.dateRange !== range) {
                  e.currentTarget.style.backgroundColor = '#e5e7eb';
                }
              }}
              onMouseLeave={(e) => {
                if (filters.dateRange !== range) {
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                }
              }}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label
          style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#374151',
            whiteSpace: 'nowrap',
          }}
        >
          Category:
        </label>
        <select
          value={filters.category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            color: '#374151',
            backgroundColor: '#ffffff',
            cursor: 'pointer',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#3b82f6';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#d1d5db';
          }}
        >
          <option value="All">All</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
        <label
          style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#374151',
            whiteSpace: 'nowrap',
          }}
        >
          Search:
        </label>
        <input
          type="text"
          value={filters.searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search questions..."
          style={{
            flex: 1,
            padding: '0.5rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            color: '#374151',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#3b82f6';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#d1d5db';
          }}
        />
      </div>
    </div>
  );
}
