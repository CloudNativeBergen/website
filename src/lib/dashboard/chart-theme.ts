/**
 * ApexCharts theme configuration
 *
 * Provides consistent chart styling matching Tailwind color palette with dark mode support
 */

import type { ApexOptions } from 'apexcharts'

// Tailwind color palette (hardcoded hex values) with dark mode variants
export const colors = {
  light: {
    primary: '#2563eb', // blue-600
    success: '#22c55e', // green-500
    warning: '#f59e0b', // amber-500
    danger: '#ef4444', // red-500
    info: '#06b6d4', // cyan-500
    purple: '#a855f7', // purple-500
    gray: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
    },
  },
  dark: {
    primary: '#3b82f6', // blue-500
    success: '#34d399', // green-400
    warning: '#fbbf24', // amber-400
    danger: '#f87171', // red-400
    info: '#22d3ee', // cyan-400
    purple: '#c084fc', // purple-400
    gray: {
      50: '#18181b', // zinc-900
      100: '#27272a', // zinc-800
      200: '#3f3f46', // zinc-700
      300: '#52525b', // zinc-600
      400: '#71717a', // zinc-500
      500: '#a1a1aa', // zinc-400
      600: '#d4d4d8', // zinc-300
      700: '#e4e4e7', // zinc-200
      800: '#f4f4f5', // zinc-100
      900: '#fafafa', // zinc-50
    },
  },
}

// Helper to get colors for current theme
export function getThemeColors(isDark = false) {
  return isDark ? colors.dark : colors.light
}

// Base chart options factory
export function getBaseChartOptions(isDark = false): ApexOptions {
  const themeColors = getThemeColors(isDark)
  return {
    chart: {
      fontFamily: 'inherit',
      toolbar: {
        show: false,
      },
      zoom: {
        enabled: false,
      },
      animations: {
        enabled: true,
        speed: 400,
      },
    },
    theme: {
      mode: isDark ? 'dark' : 'light',
    },
    grid: {
      borderColor: themeColors.gray[200],
      strokeDashArray: 3,
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: 'smooth',
      width: 2,
    },
    tooltip: {
      theme: isDark ? 'dark' : 'light',
      x: {
        format: 'dd MMM',
      },
    },
    legend: {
      position: 'bottom',
      horizontalAlign: 'left',
      fontSize: '12px',
      fontWeight: 500,
      labels: {
        colors: themeColors.gray[700],
      },
    },
    xaxis: {
      labels: {
        style: {
          colors: themeColors.gray[600],
          fontSize: '11px',
        },
      },
      axisBorder: {
        color: themeColors.gray[300],
      },
      axisTicks: {
        color: themeColors.gray[300],
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: themeColors.gray[600],
          fontSize: '11px',
        },
      },
    },
  }
}

// Line chart specific options factory
export function getLineChartOptions(isDark = false): ApexOptions {
  const base = getBaseChartOptions(isDark)
  return {
    ...base,
    chart: {
      ...base.chart,
      type: 'line',
    },
    stroke: {
      ...base.stroke,
      width: 3,
    },
  }
}

// Radial bar (gauge) chart specific options factory
export function getRadialBarChartOptions(isDark = false): ApexOptions {
  const base = getBaseChartOptions(isDark)
  const themeColors = getThemeColors(isDark)
  return {
    ...base,
    chart: {
      ...base.chart,
      type: 'radialBar',
    },
    plotOptions: {
      radialBar: {
        hollow: {
          size: '65%',
        },
        track: {
          background: themeColors.gray[100],
        },
        dataLabels: {
          name: {
            fontSize: '14px',
            color: themeColors.gray[600],
            offsetY: -10,
          },
          value: {
            fontSize: '28px',
            fontWeight: 700,
            color: themeColors.gray[900],
            offsetY: 5,
          },
        },
      },
    },
  }
}
