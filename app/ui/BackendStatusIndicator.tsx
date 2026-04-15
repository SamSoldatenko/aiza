'use client';

import { Tooltip } from '@mui/material';
import { Server, CheckCircle, XCircle, Loader } from 'lucide-react';
import { useServerConfig, BackendStatus, BackendType } from './context/ServerConfigContext';

const statusConfig: Record<BackendStatus, { color: string; icon: React.ReactNode; label: string }> = {
  checking: { color: 'text-yellow-500', icon: <Loader size={14} className="animate-spin" />, label: 'Checking...' },
  ok: { color: 'text-green-500', icon: <CheckCircle size={14} />, label: 'Connected' },
  error: { color: 'text-red-500', icon: <XCircle size={14} />, label: 'Error' },
};

const backendLabels: Record<BackendType, string> = {
  dev: 'DEV',
  prod: 'PROD',
  custom: 'CUSTOM',
};

export default function BackendStatusIndicator(): React.ReactElement {
  const { status, backendType, backendUrl, error } = useServerConfig();

  const { color, icon, label } = statusConfig[status];
  const backendLabel = backendLabels[backendType];

  const tooltipContent = error
    ? `${label}: ${error}`
    : `${backendUrl || 'Unknown'} (${label})`;

  return (
    <Tooltip title={tooltipContent}>
      <div className={`flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium ${color}`}>
        <Server size={14} />
        <span>{backendLabel}</span>
        {icon}
      </div>
    </Tooltip>
  );
}
