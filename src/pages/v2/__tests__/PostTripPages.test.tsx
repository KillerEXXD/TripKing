import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { OperatorPostTripPage } from '@/pages/v2/operator-console/PostTripPage';
import { FieldPostTripPage } from '@/pages/v2/field-companion/PostTripPage';
import { PipelinePostTripPage } from '@/pages/v2/pipeline-board/PostTripPage';
import { EditorialPostTripPage } from '@/pages/v2/editorial/PostTripPage';
import { BharatPostTripPage } from '@/pages/v2/bharat-native/PostTripPage';

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('v2 post-trip pages', () => {
  it('Operator: single-screen dense form with Post trip button', () => {
    render(<Wrap><OperatorPostTripPage /></Wrap>);
    expect(screen.getByText(/From city/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post trip/i })).toBeInTheDocument();
  });

  it('Field: shows wizard step 1 with progress + Next CTA', () => {
    render(<Wrap><FieldPostTripPage /></Wrap>);
    expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('Pipeline: 4 card sections + Move to Open CTA', () => {
    render(<Wrap><PipelinePostTripPage /></Wrap>);
    for (const s of ['Route', 'Vehicle', 'Fare', 'Passenger']) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /move to open/i })).toBeInTheDocument();
  });

  it('Editorial: file-a-submission masthead + serif-italic underline inputs', () => {
    render(<Wrap><EditorialPostTripPage /></Wrap>);
    expect(screen.getByText(/file a submission/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /file the dispatch/i })).toBeInTheDocument();
  });

  it('Bharat: bilingual fieldsets + vermilion Tamil submit', () => {
    render(<Wrap><BharatPostTripPage /></Wrap>);
    expect(screen.getByText(/புதிய டிரிப்/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /இடுகையிடு/ })).toBeInTheDocument();
  });
});
