'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCompactUSD } from '@/lib/format/number';
import { filterDataByDate } from '@/lib/utils/date-filter';

interface ChartRevenueProps {
  dailyData?: Array<{ date: string; value: number }>;
  cumulativeData?: Array<{ date: string; value: number }>;
  isLoading?: boolean;
  title?: string;
}

export function ChartRevenue({
  dailyData,
  cumulativeData,
  isLoading = false,
  title = 'Revenue',
}: ChartRevenueProps) {
  const [viewMode, setViewMode] = useState<'daily' | 'cumulative'>('cumulative');

  const filteredDailyData = useMemo(() => filterDataByDate(dailyData ?? []), [dailyData]);
  const filteredCumulativeData = useMemo(() => filterDataByDate(cumulativeData ?? []), [cumulativeData]);

  const data = useMemo(() => {
    if (viewMode === 'daily' && filteredDailyData.length > 0) {
      return filteredDailyData;
    }
    if (filteredCumulativeData.length > 0) {
      return filteredCumulativeData;
    }
    return filteredDailyData;
  }, [viewMode, filteredDailyData, filteredCumulativeData]);

  const formatTooltipValue = useMemo(() => (value: number) => formatCompactUSD(value), []);
  const formatXAxisLabel = useMemo(
    () => (tickItem: string) => {
      const date = new Date(tickItem);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },
    []
  );

  const showViewToggle = Boolean(dailyData?.length && cumulativeData?.length);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{title}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {showViewToggle && (
              <div className="flex gap-1">
                <Button
                  variant={viewMode === 'daily' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('daily')}
                >
                  Daily
                </Button>
                <Button
                  variant={viewMode === 'cumulative' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('cumulative')}
                >
                  Cumulative
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatXAxisLabel}
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              tickFormatter={(value) => formatCompactUSD(value)}
              tick={{ fontSize: 12 }}
            />
            <Tooltip 
              formatter={(value) => {
                const label = viewMode === 'cumulative' ? 'Cumulative Revenue' : 'Daily Revenue';
                if (value === undefined || value === null) return ['N/A', label];
                const numValue = typeof value === 'number' ? value : Array.isArray(value) ? value[0] : Number(value);
                if (isNaN(numValue)) return ['N/A', label];
                return [formatTooltipValue(numValue), label];
              }}
              labelFormatter={(label) => {
                if (typeof label === 'string' || typeof label === 'number') {
                  return new Date(label).toLocaleDateString();
                }
                return String(label ?? '');
              }}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
