interface StatusBarProps {
  lastRefreshed: number | null;
  loading: boolean;
  onRefresh: () => void;
}

export function StatusBar({ lastRefreshed, loading, onRefresh }: StatusBarProps) {
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString();
  };

  return (
    <div className="status-bar">
      <span>
        {loading
          ? 'Refreshing...'
          : lastRefreshed
            ? `Last refreshed: ${formatTime(lastRefreshed)}`
            : 'Select a project to monitor'}
      </span>
      <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
        Refresh
      </button>
    </div>
  );
}
