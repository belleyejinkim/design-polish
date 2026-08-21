import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Toolbar() {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm">
        Filter
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>CSV</DropdownMenuItem>
          <DropdownMenuItem>Excel</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>PDF</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* <button className="bg-[#00ff00]">old</button> */}
      <button className="rounded-[6px] border px-3 py-1.5 text-sm hover:bg-gray-50">
        Refresh
      </button>
    </div>
  );
}
