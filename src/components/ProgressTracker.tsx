import React from 'react';
import { CheckCircle, AlertCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

interface ProgressStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
  message?: string;
  duration?: number;
  estimatedTime?: number;
}

interface ProgressTrackerProps {
  steps: ProgressStep[];
  title?: string;
  showProgress?: boolean;
  showDuration?: boolean;
  className?: string;
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  steps,
  title,
  showProgress = true,
  showDuration = false,
  className
}) => {
  const getStatusIcon = (status: ProgressStep['status']) => {
    switch (status) {
      case 'pending':
        return <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded-full" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />;
    }
  };

  const getStatusColor = (status: ProgressStep['status']) => {
    switch (status) {
      case 'pending':
        return 'text-gray-500 dark:text-gray-400';
      case 'processing':
        return 'text-blue-600 dark:text-blue-400';
      case 'completed':
        return 'text-green-600 dark:text-green-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-500 dark:text-gray-400';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const totalSteps = steps.length;
  const overallProgress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div className={cn("space-y-4", className)}>
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {completedSteps} of {totalSteps} completed
          </div>
        </div>
      )}

      {/* Overall Progress Bar */}
      {showProgress && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      )}

      {/* Individual Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div 
            key={step.id} 
            className={cn(
              "border rounded-lg p-4 transition-all duration-200",
              step.status === 'processing' 
                ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20" 
                : step.status === 'completed'
                ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20"
                : step.status === 'error'
                ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3">
                {getStatusIcon(step.status)}
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className={cn(
                      "font-medium",
                      getStatusColor(step.status)
                    )}>
                      {step.name}
                    </span>
                    {step.status === 'processing' && step.estimatedTime && (
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <Clock className="w-3 h-3 mr-1" />
                        ~{formatDuration(step.estimatedTime)} remaining
                      </div>
                    )}
                  </div>
                  {step.message && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {step.message}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                {step.status === 'processing' && step.progress !== undefined && (
                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    {step.progress}%
                  </span>
                )}
                {showDuration && step.duration && step.status === 'completed' && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDuration(step.duration)}
                  </span>
                )}
              </div>
            </div>
            
            {/* Individual Step Progress Bar */}
            {step.status === 'processing' && step.progress !== undefined && (
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div 
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    step.status === 'processing' ? "bg-blue-500" : "bg-green-500"
                  )}
                  style={{ width: `${step.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      {steps.length > 0 && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              Progress: {Math.round(overallProgress)}%
            </span>
            <div className="flex items-center space-x-4">
              {steps.some(step => step.status === 'error') && (
                <span className="text-red-600 dark:text-red-400">
                  {steps.filter(step => step.status === 'error').length} failed
                </span>
              )}
              {steps.some(step => step.status === 'processing') && (
                <span className="text-blue-600 dark:text-blue-400">
                  {steps.filter(step => step.status === 'processing').length} in progress
                </span>
              )}
              <span className="text-green-600 dark:text-green-400">
                {completedSteps} completed
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressTracker;