import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import CommandOverview from './pages/CommandOverview';
import SystemStatus from './pages/SystemStatus';
import Area1Monitoring from './pages/Area1Monitoring';
import Area1PointAnalysis from './pages/Area1PointAnalysis';
import Area2Overview from './pages/Area2Overview';
import Area2Tunneling from './pages/Area2Tunneling';
import Area2SlurryGrouting from './pages/Area2SlurryGrouting';
import Area2Monitoring from './pages/Area2Monitoring';
import DocumentsEvidence from './pages/DocumentsEvidence';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/command-overview" replace /> },
      { path: 'command-overview', element: <CommandOverview /> },
      { path: 'area1-monitoring', element: <Area1Monitoring /> },
      { path: 'area1-point-analysis', element: <Area1PointAnalysis /> },
      { path: 'area2-overview', element: <Area2Overview /> },
      { path: 'area2-tunneling', element: <Area2Tunneling /> },
      { path: 'area2-slurry-grouting', element: <Area2SlurryGrouting /> },
      { path: 'area2-monitoring', element: <Area2Monitoring /> },
      { path: 'documents-evidence', element: <DocumentsEvidence /> },
      { path: 'system-status', element: <SystemStatus /> },
    ],
  },
]);
