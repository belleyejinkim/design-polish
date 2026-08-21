export function ChartLegend() {
  return (
    <ul className="flex gap-4 text-xs">
      <li className="flex items-center gap-1">
        <span className="inline-block size-2 rounded-full" style={{ background: '#4F46E5' }} />
        Revenue
      </li>
      <li className="flex items-center gap-1">
        <span className="inline-block size-2 rounded-full" style={{ background: '#22C55E' }} />
        Orders
      </li>
    </ul>
  );
}
