import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('merges a custom className', () => {
    render(<Button className="bg-[#ff0000]">Danger</Button>);
    expect(screen.getByRole('button').className).toContain('bg-[#ff0000]');
  });
});
