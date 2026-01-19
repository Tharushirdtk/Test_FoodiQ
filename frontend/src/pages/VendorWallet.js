import React, { useEffect, useState } from 'react';
import TimeSeriesChart from '../components/TimeSeriesChart';
import Dropdown from '../components/Dropdown';
import analyticsService from '../services/analyticsService';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

export default function VendorWallet() {
  const { user } = useAuth();
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('monthly');

  const rangeOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
  ];

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await analyticsService.getRevenueSeries({ entity: 'vendor', entityId: user._id, range });
        if (!mounted) return;
        setSeries(res.series || []);
      } catch (e) {
        console.error('Failed to load vendor revenue', e);
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [user._id, range]);

  if (loading) return <div className="sub-page"><LoadingSpinner /></div>;

  return (
    <div className="sub-page">
      <div className="sub-header">
        <h2>Wallet</h2>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Total revenue</h3>
          <div style={{ minWidth: 160 }}>
            <Dropdown options={rangeOptions} value={range} onChange={setRange} />
          </div>
        </div>
        <TimeSeriesChart series={series} title="Revenue" color="#4caf50" range={range} />
      </div>
    </div>
  );
}
