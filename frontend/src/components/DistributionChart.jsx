/**
 * DistributionChart – how many sentences fall in each 20% score band.
 *
 * The "React draws, D3 calculates" pattern from the Week 8 showcase: D3's
 * scales work out positions, React renders the SVG. Bars are buttons, so the
 * chart works with a keyboard as well as a mouse; clicking one selects it.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3';
import { Box, Tooltip } from '@mui/material';
import { bandFor } from '../lib/scoring.js';
import { likelihood } from '../theme.js';

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export default function DistributionChart({ bins, selected, onSelect, height = 230 }) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const margin = { top: 22, right: 4, bottom: 28, left: 4 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;

  const x = scaleBand()
    .domain(bins.map((b) => b.label))
    .range([0, innerW])
    .padding(0.18);
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const y = scaleLinear().domain([0, maxCount]).range([innerH, 0]);

  return (
    <Box ref={wrapRef} sx={{ width: '100%' }}>
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-label="Number of sentences in each AI-score range">
          <g transform={`translate(${margin.left},${margin.top})`}>
            <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#cfcfcf" />
            {bins.map((b) => {
              const band = bandFor((b.lo + b.hi) / 2);
              const colour = likelihood[band.key].main;
              const barH = innerH - y(b.count);
              const isSelected = selected === b.label;
              const dimmed = selected && !isSelected;
              return (
                <Tooltip key={b.label} title={`${b.count} sentence${b.count === 1 ? '' : 's'} scored ${b.label}`}>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${b.label}: ${b.count} sentences. ${isSelected ? 'Selected.' : 'Select to list them.'}`}
                    onClick={() => onSelect?.(isSelected ? null : b.label)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect?.(isSelected ? null : b.label);
                      }
                    }}
                    style={{ cursor: 'pointer', outline: 'none' }}
                    className="chart-bar"
                  >
                    {/* invisible full-height hit area so short bars are easy to click */}
                    <rect x={x(b.label)} y={0} width={x.bandwidth()} height={innerH} fill="transparent" />
                    <rect
                      x={x(b.label)}
                      y={y(b.count)}
                      width={x.bandwidth()}
                      height={Math.max(barH, b.count ? 2 : 0)}
                      fill={colour}
                      opacity={dimmed ? 0.3 : 1}
                      rx={2}
                      stroke={isSelected ? '#222' : 'none'}
                      strokeWidth={2}
                    />
                    <text
                      x={x(b.label) + x.bandwidth() / 2}
                      y={y(b.count) - 6}
                      textAnchor="middle"
                      fontSize={13}
                      fontWeight={700}
                      fill="#333"
                    >
                      {b.count}
                    </text>
                    <text x={x(b.label) + x.bandwidth() / 2} y={innerH + 18} textAnchor="middle" fontSize={11.5} fill="#666">
                      {b.label}
                    </text>
                  </g>
                </Tooltip>
              );
            })}
          </g>
        </svg>
      )}
      <style>{`.chart-bar:focus-visible rect:last-of-type { stroke: #1a73e8; stroke-width: 3px; }`}</style>
    </Box>
  );
}
